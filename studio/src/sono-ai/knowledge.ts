import { createHash } from 'node:crypto';
import type { Project } from '@/lib/types';
import type { SiteConfig } from '@/site/schema';
import { clientOf } from './backfill';
import { Redactor, type Redaction } from './redact';
import type { Chunk, NewChunk, Outcome, SonoAiStore } from './store';

/*
 * The knowledge search index. Studio records (project summaries, client
 * notes, pitch outcomes) are redacted, cut into small chunks and given an
 * embedding, so stage 3 can find them by meaning. Only changed chunks are
 * rewritten and re-embedded; chunks whose record is gone are removed, and a
 * deleted project's chunks go with it. Read-only on studio data.
 */

export const EMBED_DIMENSIONS = 768;
const MAX_CHUNK = 900;

export type Embedder = (texts: string[]) => Promise<number[][]>;

/** What the indexer reads from the studio, matching the studio's Repo. */
export interface IndexReader {
  listProjects(): Promise<Project[]>;
  getSiteVersion(projectId: string): Promise<{ config: SiteConfig } | null>;
}

interface Source {
  projectId: string | null;
  source: string;
  sourceId: string;
  text: string;
}

/** Cuts text at paragraph, then line, then sentence boundaries into chunks of at most `max` characters. */
export function chunkText(text: string, max = MAX_CHUNK): string[] {
  const out: string[] = [];
  let cur = '';
  const pieces = text
    .split(/\n{2,}/)
    .flatMap((p) => (p.length <= max ? [p] : p.split(/\n/)))
    .flatMap((p) => (p.length <= max ? [p] : (p.match(new RegExp(`[^.!?]{1,${max}}[.!?]*\\s*`, 'g')) ?? [p])));
  for (const piece of pieces.map((p) => p.trim()).filter(Boolean)) {
    if (cur && cur.length + piece.length + 2 > max) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${piece}` : piece.slice(0, max);
  }
  if (cur) out.push(cur);
  return out;
}

const STATUS: Record<string, string> = { draft: 'draft', pitch_sent: 'pitch sent', client_approved: 'approved by the client', live: 'live' };
const day = (iso: string) => iso.slice(0, 10);

/** A plain-words summary of a project and its site, before redaction. */
export function projectSummary(p: Project, config: SiteConfig | null): string {
  const lines = [
    `Project ${p.name}: a ${p.businessType || 'business'} ${p.siteType} site, ${STATUS[p.status] ?? p.status}. Style preset ${p.preset}.`,
    p.headline ? `Headline: ${p.headline}` : '',
    p.pitchSentAt ? `Pitch sent ${day(p.pitchSentAt)}${p.lastOpenedAt ? `, last opened ${day(p.lastOpenedAt)}` : ', not opened yet'}.` : '',
    // The live address often spells the business name, so it stays out.
    p.liveAt ? `Live since ${day(p.liveAt)}.` : '',
  ];
  if (config) {
    for (const page of config.pages) {
      const sections = page.sections
        .filter((s) => !s.hidden)
        .map((s) => {
          const c = (s.type === 'custom' ? s.content.data : s.content) as Record<string, unknown>;
          return typeof c.heading === 'string' && c.heading ? `${s.type} ("${c.heading}")` : s.type;
        });
      lines.push(`Page ${page.title} (${page.path}): ${sections.join(', ')}.`);
    }
    if (config.store) lines.push(`Shop: ${config.store.products.length} products in ${config.store.currency}.`);
    if (config.bookings) lines.push(`Bookings: ${config.bookings.services.map((s) => s.name).join(', ')}.`);
  }
  return lines.filter(Boolean).join('\n');
}

const OUTCOME: Record<Outcome['kind'], string> = {
  kept: 'kept',
  edited: 'edited by you',
  undone: 'undone',
  regenerated: 'regenerated',
  pitch_opened: 'pitch opened',
  approved: 'approved by the client',
  live: 'went live',
};

export function outcomeSummary(name: string, outcomes: Outcome[]): string {
  if (!outcomes.length) return '';
  const counts = new Map<string, number>();
  for (const o of outcomes) if (o.interactionId) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
  const results = [...counts].map(([k, n]) => `${n} ${OUTCOME[k as Outcome['kind']]}`).join(', ');
  const events = outcomes
    .filter((o) => !o.interactionId)
    .sort((a, b) => a.happenedAt.localeCompare(b.happenedAt))
    .map((o) => `${OUTCOME[o.kind]} on ${day(o.happenedAt)}${o.kind === 'pitch_opened' && o.detail ? ` (${o.detail})` : ''}`);
  return [`Outcomes for ${name}.`, results ? `AI results: ${results}.` : '', events.length ? `Pitch: ${events.join('; ')}.` : ''].filter(Boolean).join(' ');
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/** What should be in the index, redacted and chunked. */
export function wantedChunks(sources: Source[]): NewChunk[] {
  return sources.flatMap((s) =>
    chunkText(s.text).map((content, chunk) => ({ projectId: s.projectId, source: s.source, sourceId: s.sourceId, chunk, content, contentHash: hash(content) })),
  );
}

/** The changes that bring the index in line: chunks to write and chunks to remove. */
export function planIndex(existing: Chunk[], wanted: NewChunk[]): { save: NewChunk[]; remove: string[] } {
  const key = (c: { source: string; sourceId: string; chunk: number }) => `${c.source}|${c.sourceId}|${c.chunk}`;
  const have = new Map(existing.map((c) => [key(c), c]));
  const want = new Set(wanted.map(key));
  return {
    save: wanted.filter((w) => have.get(key(w))?.contentHash !== w.contentHash),
    remove: existing.filter((c) => !want.has(key(c))).map((c) => c.id),
  };
}

export interface IndexResult {
  chunks: number;
  changed: number;
  removed: number;
  embedded: number;
  /** Chunks still waiting for an embedding (no Gemini key, or it failed). */
  waiting: number;
}

/** Brings the index up to date and embeds whatever is missing an embedding. */
export async function buildIndex(studio: IndexReader, store: SonoAiStore, embed: Embedder | null): Promise<IndexResult> {
  const sources: Source[] = [];
  const outcomes = await store.listOutcomes();
  for (const p of await studio.listProjects()) {
    const existing = await store.getRedactions(p.id);
    const redactor = new Redactor(existing, clientOf(p));
    const version = await studio.getSiteVersion(p.id).catch(() => null);
    sources.push({ projectId: p.id, source: 'project', sourceId: p.id, text: redactor.redact(projectSummary(p, version?.config ?? null)) });
    if (p.client.notes.trim()) sources.push({ projectId: p.id, source: 'client_notes', sourceId: p.id, text: redactor.redact(`Notes on ${p.name}: ${p.client.notes}`) });
    const mine = outcomes.filter((o) => o.projectId === p.id);
    if (mine.length) sources.push({ projectId: p.id, source: 'outcomes', sourceId: p.id, text: redactor.redact(outcomeSummary(p.name, mine)) });
    if (redactor.added.length) await store.addRedactions(p.id, redactor.added.splice(0) as Redaction[]);
  }

  const wanted = wantedChunks(sources);
  const { save, remove } = planIndex(await store.listChunks(), wanted);
  await store.saveChunks(save);
  await store.deleteChunks(remove);

  let embedded = 0;
  const missing = (await store.listChunks()).filter((c) => !c.embedded);
  if (embed) {
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      try {
        const vectors = await embed(batch.map((c) => c.content));
        for (let j = 0; j < batch.length; j++) if (vectors[j]?.length === EMBED_DIMENSIONS) {
          await store.setEmbedding(batch[j].id, vectors[j]);
          embedded++;
        }
      } catch (err) {
        console.warn('Sono AI: embeddings failed, will retry next time:', (err as Error).message);
        break;
      }
    }
  }
  return { chunks: wanted.length, changed: save.length, removed: remove.length, embedded, waiting: missing.length - embedded };
}

/** Gemini's free embedding model, 768 dimensions to match the index. */
export function geminiEmbedder(
  apiKey: string,
  f: typeof fetch = fetch,
  base = process.env.SONO_GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  /** Documents are indexed with RETRIEVAL_DOCUMENT; questions are embedded with RETRIEVAL_QUERY. */
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Embedder {
  const model = 'gemini-embedding-001';
  return async (texts) => {
    const res = await f(`${base}/models/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: texts.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] }, taskType, outputDimensionality: EMBED_DIMENSIONS })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Gemini embeddings ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const data = (await res.json()) as { embeddings?: { values: number[] }[] };
    return (data.embeddings ?? []).map((e) => e.values);
  };
}
