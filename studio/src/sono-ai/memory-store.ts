import type { Redaction } from './redact';
import type { Chunk, Interaction, NewChunk, NewInteraction, Outcome, SonoAiStore } from './store';

/** An in-memory knowledge bank for tests. */
export function memoryStore(): SonoAiStore & { rows: Interaction[]; outcomes: Outcome[]; redactions: Redaction[]; chunks: (Chunk & { embedding?: number[] })[] } {
  const s = {
    rows: [] as Interaction[],
    outcomes: [] as Outcome[],
    redactions: [] as Redaction[],
    async addInteractions(rows: NewInteraction[]) {
      for (const r of rows) if (!r.sourceRef || !s.rows.some((x) => x.sourceRef === r.sourceRef)) s.rows.push({ ...r, id: `i${s.rows.length + 1}`, createdAt: r.createdAt ?? new Date().toISOString() });
    },
    async listInteractions({ projectId }: { projectId?: string } = {}) {
      return s.rows.filter((r) => !projectId || r.projectId === projectId);
    },
    async addOutcomes(rows: Outcome[]) {
      for (const o of rows) if (!s.outcomes.some((x) => x.key === o.key)) s.outcomes.push(o);
    },
    async listOutcomes() {
      return s.outcomes;
    },
    async getRedactions() {
      return s.redactions;
    },
    async addRedactions(_: string, rows: Redaction[]) {
      s.redactions.push(...rows);
    },
    chunks: [] as (Chunk & { embedding?: number[] })[],
    async listChunks() {
      return s.chunks.map((c) => ({ ...c, embedded: !!c.embedding }));
    },
    async saveChunks(rows: NewChunk[]) {
      for (const r of rows) {
        const at = s.chunks.findIndex((c) => c.source === r.source && c.sourceId === r.sourceId && c.chunk === r.chunk);
        const row = { ...r, id: at >= 0 ? s.chunks[at].id : `k${s.chunks.length + 1}-${r.sourceId}-${r.chunk}`, embedded: false };
        if (at >= 0) s.chunks[at] = row;
        else s.chunks.push(row);
      }
    },
    async deleteChunks(ids: string[]) {
      s.chunks = s.chunks.filter((c) => !ids.includes(c.id));
    },
    async setEmbedding(id: string, embedding: number[]) {
      const c = s.chunks.find((x) => x.id === id);
      if (c) c.embedding = embedding;
    },
    async firstLive() {
      return s.rows.filter((r) => r.source === 'live').map((r) => r.createdAt).sort()[0] ?? null;
    },
    async stats() {
      return { interactions: s.rows.length, live: 0, backfilled: 0, outcomes: s.outcomes.length, redactions: s.redactions.length };
    },
  };
  return s;
}
