import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isDevStore } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Redaction } from './redact';

/*
 * The knowledge bank's own storage. Sono AI keeps everything in its own
 * tables (supabase/migrations/0012_sono_ai.sql) and only reads the studio's.
 * Writes go through the signed-in owner's session, so row-level security
 * applies; without Supabase a local file stands in, like the studio's dev store.
 */

export type InteractionStatus = 'ok' | 'error' | 'limit';

export interface Interaction {
  id: string;
  projectId: string | null;
  siteType: string | null;
  task: string;
  source: 'live' | 'backfill';
  /** Unique per owner; makes the backfill safe to run again. */
  sourceRef: string | null;
  system: string;
  request: string;
  answer: string | null;
  provider: string;
  model: string;
  ms: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  status: InteractionStatus;
  error: string | null;
  createdAt: string;
}

export type NewInteraction = Omit<Interaction, 'id' | 'createdAt'> & { createdAt?: string };

export type OutcomeKind = 'kept' | 'edited' | 'undone' | 'regenerated' | 'pitch_opened' | 'approved' | 'live';

export interface Outcome {
  projectId: string;
  interactionId: string | null;
  kind: OutcomeKind;
  /** The site version that shows the result (for "edited", your version). */
  version: number | null;
  detail: string;
  /** Unique per owner, so linking again changes nothing. */
  key: string;
  happenedAt: string;
}

export interface BankStats {
  interactions: number;
  live: number;
  backfilled: number;
  outcomes: number;
  redactions: number;
}

/** One piece of the knowledge search index: redacted text and its embedding. */
export interface Chunk {
  id: string;
  projectId: string | null;
  source: string;
  sourceId: string;
  chunk: number;
  content: string;
  contentHash: string;
  embedded: boolean;
}
export type NewChunk = Omit<Chunk, 'id' | 'embedded'>;

export interface SonoAiStore {
  addInteractions(rows: NewInteraction[]): Promise<void>;
  /** Newest first, without the request and answer text unless asked. */
  listInteractions(opts?: { projectId?: string; limit?: number; withText?: boolean }): Promise<Interaction[]>;
  addOutcomes(rows: Outcome[]): Promise<void>;
  listOutcomes(projectId?: string): Promise<Outcome[]>;
  getRedactions(projectId: string): Promise<Redaction[]>;
  addRedactions(projectId: string, rows: Redaction[]): Promise<void>;
  stats(): Promise<BankStats>;
  /** When live recording started (the oldest live row), or null. History after it is already recorded. */
  firstLive(): Promise<string | null>;
  /** The index, without embeddings. */
  listChunks(): Promise<Chunk[]>;
  /** Adds or replaces chunks (by source, source id and number); a replaced chunk loses its embedding. */
  saveChunks(rows: NewChunk[]): Promise<void>;
  deleteChunks(ids: string[]): Promise<void>;
  setEmbedding(id: string, embedding: number[]): Promise<void>;
}

/* ---------- Supabase ---------- */

type InteractionRow = {
  id: string; project_id: string | null; site_type: string | null; task: string; source: 'live' | 'backfill'; source_ref: string | null;
  system?: string; request?: string; answer?: string | null; provider: string; model: string; ms: number | null;
  input_tokens: number | null; output_tokens: number | null; status: InteractionStatus; error: string | null; created_at: string;
};

const LIST_COLUMNS = 'id, project_id, site_type, task, source, source_ref, provider, model, ms, input_tokens, output_tokens, status, error, created_at';

function fromRow(r: InteractionRow): Interaction {
  return {
    id: r.id, projectId: r.project_id, siteType: r.site_type, task: r.task, source: r.source, sourceRef: r.source_ref,
    system: r.system ?? '', request: r.request ?? '', answer: r.answer ?? null, provider: r.provider, model: r.model, ms: r.ms,
    inputTokens: r.input_tokens, outputTokens: r.output_tokens, status: r.status, error: r.error, createdAt: r.created_at,
  };
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(`Sono AI storage: ${error.message}`);
}

export function supabaseStore(db: SupabaseClient): SonoAiStore {
  return {
    async addInteractions(rows) {
      if (!rows.length) return;
      const values = rows.map((r) => ({
        project_id: r.projectId, site_type: r.siteType, task: r.task, source: r.source, source_ref: r.sourceRef, system: r.system,
        request: r.request, answer: r.answer, provider: r.provider, model: r.model, ms: r.ms, input_tokens: r.inputTokens,
        output_tokens: r.outputTokens, status: r.status, error: r.error, ...(r.createdAt ? { created_at: r.createdAt } : {}),
      }));
      // Rows with a source_ref already in the bank are skipped, so the backfill can run twice.
      const { error } = rows.some((r) => r.sourceRef)
        ? await db.from('ai_interactions').upsert(values, { onConflict: 'owner_id,source_ref', ignoreDuplicates: true })
        : await db.from('ai_interactions').insert(values);
      check(error);
    },
    async listInteractions({ projectId, limit = 50, withText = false } = {}) {
      let q = db.from('ai_interactions').select(withText ? '*' : LIST_COLUMNS).order('created_at', { ascending: false }).limit(limit);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      check(error);
      return ((data ?? []) as unknown as InteractionRow[]).map(fromRow);
    },
    async addOutcomes(rows) {
      if (!rows.length) return;
      const { error } = await db.from('outcomes').upsert(
        rows.map((o) => ({ project_id: o.projectId, interaction_id: o.interactionId, kind: o.kind, version: o.version, detail: o.detail, key: o.key, happened_at: o.happenedAt })),
        { onConflict: 'owner_id,key', ignoreDuplicates: true },
      );
      check(error);
    },
    async listOutcomes(projectId) {
      let q = db.from('outcomes').select('project_id, interaction_id, kind, version, detail, key, happened_at').order('happened_at', { ascending: false }).limit(500);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      check(error);
      return (data ?? []).map((o) => ({ projectId: o.project_id, interactionId: o.interaction_id, kind: o.kind, version: o.version, detail: o.detail, key: o.key, happenedAt: o.happened_at }));
    },
    async getRedactions(projectId) {
      const { data, error } = await db.from('redaction_map').select('placeholder, kind, value').eq('project_id', projectId).order('created_at');
      check(error);
      return (data ?? []) as Redaction[];
    },
    async addRedactions(projectId, rows) {
      if (!rows.length) return;
      const { error } = await db.from('redaction_map').upsert(
        rows.map((r) => ({ project_id: projectId, ...r })),
        { onConflict: 'project_id,kind,value', ignoreDuplicates: true },
      );
      check(error);
    },
    async stats() {
      const count = async (table: string, filter?: [string, string]) => {
        let q = db.from(table).select('id', { count: 'exact', head: true });
        if (filter) q = q.eq(filter[0], filter[1]);
        const { count: n, error } = await q;
        check(error);
        return n ?? 0;
      };
      const [interactions, live, outcomes, redactions] = await Promise.all([count('ai_interactions'), count('ai_interactions', ['source', 'live']), count('outcomes'), count('redaction_map')]);
      return { interactions, live, backfilled: interactions - live, outcomes, redactions };
    },
    async listChunks() {
      const out: Chunk[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from('knowledge_chunks')
          .select('id, project_id, source, source_id, chunk, content, content_hash, has_embedding')
          .range(from, from + 999);
        check(error);
        const rows = (data ?? []) as unknown as { id: string; project_id: string | null; source: string; source_id: string; chunk: number; content: string; content_hash: string; has_embedding: boolean }[];
        out.push(...rows.map((r) => ({ id: r.id, projectId: r.project_id, source: r.source, sourceId: r.source_id, chunk: r.chunk, content: r.content, contentHash: r.content_hash, embedded: r.has_embedding })));
        if (rows.length < 1000) return out;
      }
    },
    async saveChunks(rows) {
      if (!rows.length) return;
      const { error } = await db.from('knowledge_chunks').upsert(
        rows.map((c) => ({ project_id: c.projectId, source: c.source, source_id: c.sourceId, chunk: c.chunk, content: c.content, content_hash: c.contentHash, embedding: null, indexed_at: new Date().toISOString() })),
        { onConflict: 'owner_id,source,source_id,chunk' },
      );
      check(error);
    },
    async deleteChunks(ids) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await db.from('knowledge_chunks').delete().in('id', ids.slice(i, i + 200));
        check(error);
      }
    },
    async setEmbedding(id, embedding) {
      const { error } = await db.from('knowledge_chunks').update({ embedding: JSON.stringify(embedding) }).eq('id', id);
      check(error);
    },
    async firstLive() {
      const { data, error } = await db.from('ai_interactions').select('created_at').eq('source', 'live').order('created_at').limit(1);
      check(error);
      return data?.[0]?.created_at ?? null;
    },
  };
}

/* ---------- Local file (development without Supabase) ---------- */

interface DevBank {
  interactions: Interaction[];
  outcomes: Outcome[];
  redactions: (Redaction & { projectId: string })[];
  chunks?: (Omit<Chunk, 'embedded'> & { embedding: number[] | null })[];
}

const FILE = path.join(process.cwd(), '.data', 'sono-ai.json');
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DevBank> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as DevBank;
  } catch {
    return { interactions: [], outcomes: [], redactions: [] };
  }
}

/** One write at a time, so concurrent requests don't lose each other's rows. */
function change(fn: (bank: DevBank) => void): Promise<void> {
  const next = queue.then(async () => {
    const bank = await load();
    fn(bank);
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(`${FILE}.tmp`, JSON.stringify(bank));
    await rename(`${FILE}.tmp`, FILE);
  });
  queue = next.catch(() => {});
  return next;
}

export const devStore: SonoAiStore = {
  addInteractions: (rows) =>
    change((bank) => {
      const refs = new Set(bank.interactions.map((i) => i.sourceRef).filter(Boolean));
      for (const r of rows) if (!r.sourceRef || !refs.has(r.sourceRef)) bank.interactions.push({ ...r, id: randomUUID(), createdAt: r.createdAt ?? new Date().toISOString() });
    }),
  async listInteractions({ projectId, limit = 50, withText = false } = {}) {
    const bank = await load();
    return bank.interactions
      .filter((i) => !projectId || i.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((i) => (withText ? i : { ...i, system: '', request: '', answer: null }));
  },
  addOutcomes: (rows) =>
    change((bank) => {
      const keys = new Set(bank.outcomes.map((o) => o.key));
      for (const o of rows) if (!keys.has(o.key)) bank.outcomes.push(o);
    }),
  async listOutcomes(projectId) {
    return (await load()).outcomes.filter((o) => !projectId || o.projectId === projectId).sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  },
  async getRedactions(projectId) {
    return (await load()).redactions.filter((r) => r.projectId === projectId).map(({ placeholder, kind, value }) => ({ placeholder, kind, value }));
  },
  addRedactions: (projectId, rows) =>
    change((bank) => {
      for (const r of rows) if (!bank.redactions.some((x) => x.projectId === projectId && x.kind === r.kind && x.value === r.value)) bank.redactions.push({ ...r, projectId });
    }),
  async stats() {
    const bank = await load();
    const live = bank.interactions.filter((i) => i.source === 'live').length;
    return { interactions: bank.interactions.length, live, backfilled: bank.interactions.length - live, outcomes: bank.outcomes.length, redactions: bank.redactions.length };
  },
  async listChunks() {
    return ((await load()).chunks ?? []).map(({ embedding, ...c }) => ({ ...c, embedded: !!embedding }));
  },
  saveChunks: (rows) =>
    change((bank) => {
      const chunks = (bank.chunks ??= []);
      for (const r of rows) {
        const at = chunks.findIndex((c) => c.source === r.source && c.sourceId === r.sourceId && c.chunk === r.chunk);
        const row = { ...r, id: at >= 0 ? chunks[at].id : randomUUID(), embedding: null };
        if (at >= 0) chunks[at] = row;
        else chunks.push(row);
      }
    }),
  deleteChunks: (ids) => change((bank) => void (bank.chunks = (bank.chunks ?? []).filter((c) => !ids.includes(c.id)))),
  setEmbedding: (id, embedding) =>
    change((bank) => {
      const c = (bank.chunks ?? []).find((x) => x.id === id);
      if (c) c.embedding = embedding;
    }),
  async firstLive() {
    const live = (await load()).interactions.filter((i) => i.source === 'live').map((i) => i.createdAt).sort();
    return live[0] ?? null;
  },
};

export async function getStore(): Promise<SonoAiStore> {
  return isDevStore() ? devStore : supabaseStore(await createSupabaseServerClient());
}
