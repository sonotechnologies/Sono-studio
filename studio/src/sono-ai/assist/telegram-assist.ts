import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { makeClient } from '@/ai/providers';
import type { RouterHooks } from '@/ai/router';
import { PROVIDER_INFO, type AiProviderId, type ProviderClient } from '@/ai/types';
import { decryptSecret } from '@/lib/crypto';
import { devRepo } from '@/lib/data/dev-repo';
import { isDevStore, supabaseEnv } from '@/lib/env';
import { pitchUrl, siteUrl } from '@/lib/format';
import { defer } from '../index';
import { geminiEmbedder } from '../knowledge';
import { settingsStore, sonoAiKey } from '../notify-store';
import { recorded } from '../record';
import type { Redaction } from '../redact';
import { devStore, type ChunkHit, type NewInteraction, type SonoAiStore } from '../store';
import type { Snapshot, SnapshotProject } from './context';
import type { DraftDeps } from './drafts';
import type { AssistDeps } from './engine';
import { forAssistant } from './reserve';
import { devAssist } from './store';
import type { Draft, NewDraft, ScoreRow } from './types';
import { geminiWebSearch } from './web';

/*
 * The assistant on Telegram, where there's no signed-in user: everything it
 * reads and writes goes through narrow database functions that need the
 * server's Sono AI key (supabase/migrations/0014_sono_ai_assist.sql).
 */

export interface TgState {
  providers: { provider: string; ciphertext: string; models: Partial<Record<'strong' | 'light', string>>; dailyLimit: number | null; used: number; cooldownUntil: string | null }[];
  rules: string[];
  history: { role: 'user' | 'assistant'; text: string }[];
  editingDraft: string | null;
  voice: string[];
  pendingFollowUps: string[];
  followUpDays: number;
  projects: SnapshotProject[];
  scorecards: ScoreRow[];
  redactions: (Redaction & { projectId: string })[];
}

export type TgOp =
  | { op: 'message'; args: { role: 'user' | 'assistant'; text: string; mode: string | null; sources?: unknown[] } }
  | { op: 'rule'; args: { text: string } }
  | { op: 'confirm_rule'; args: { id: string } }
  | { op: 'feedback'; args: { kind: 'reply' | 'draft'; id: string; rating: 1 | -1 } }
  | { op: 'draft'; args: { id: string; decision: 'approved' | 'skipped' | 'editing' | 'cancel_edit'; body?: string } }
  | { op: 'add_drafts'; args: { rows: NewDraft[] } }
  | { op: 'log'; args: { rows: Partial<NewInteraction>[] } }
  | { op: 'usage'; args: { provider: string } }
  | { op: 'cooldown'; args: { provider: string; until: string } };

export interface TgBackend {
  state(): Promise<TgState | null>;
  write<T = unknown>(w: TgOp): Promise<T | null>;
  match(embedding: number[], count: number): Promise<ChunkHit[]>;
}

type DraftRow = { id: string; project_id: string | null; kind: Draft['kind']; channel: Draft['channel']; recipient: string; title: string; why: string; body: string; final_body: string | null; status: Draft['status']; created_at: string; decided_at: string | null };
export const draftFromRow = (r: DraftRow): Draft => ({
  id: r.id, projectId: r.project_id, kind: r.kind, channel: r.channel, recipient: r.recipient, title: r.title, why: r.why, body: r.body,
  finalBody: r.final_body, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at,
});

function supabaseTg(): TgBackend {
  const env = supabaseEnv()!;
  const db = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, { p_key: sonoAiKey(), ...args });
    if (error) throw new Error(`Sono AI: ${error.message}`);
    return data as T;
  };
  return {
    state: () => rpc<TgState | null>('sono_ai_tg_state', {}),
    write: <T>(w: TgOp) => rpc<T | null>('sono_ai_tg_write', { p_op: w.op, p_args: w.args }),
    async match(embedding, count) {
      const rows = await rpc<{ project_id: string | null; source: string; source_id: string; content: string; similarity: number }[]>('sono_ai_tg_match', { p_query: JSON.stringify(embedding), p_count: count });
      return (rows ?? []).map((r) => ({ projectId: r.project_id, source: r.source, sourceId: r.source_id, content: r.content, similarity: r.similarity }));
    },
  };
}

/** The same, from the local files the dev store uses. */
const devTg: TgBackend = {
  async state() {
    const [projects, keys, rules, messages, drafts, settings, scorecards] = await Promise.all([
      devRepo.listProjects(), devRepo.listProviderKeys(), devAssist.rules(), devAssist.messages('telegram', 10), devAssist.drafts(), (await settingsStore()).get(), devAssist.scorecards(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const redactions = (await Promise.all(projects.map(async (p) => (await devStore.getRedactions(p.id)).map((r) => ({ ...r, projectId: p.id }))))).flat();
    return {
      providers: keys.filter((k) => k.provider in PROVIDER_INFO).map((k) => ({ provider: k.provider, ciphertext: k.ciphertext, models: k.models, dailyLimit: k.dailyLimit, used: k.usageDay === today ? k.usageCount : 0, cooldownUntil: k.cooldownUntil })),
      rules: rules.filter((r) => r.enabled && r.confirmed).map((r) => r.text),
      history: messages.map((m) => ({ role: m.role, text: m.text })),
      editingDraft: devEditing,
      voice: await devAssist.voice(),
      pendingFollowUps: drafts.filter((d) => d.kind === 'follow_up' && d.status === 'pending').map((d) => d.projectId!).filter(Boolean),
      followUpDays: settings.followUpDays,
      projects: projects.map((p) => ({
        id: p.id, name: p.name, businessType: p.businessType, siteType: p.siteType, status: p.status, createdAt: p.createdAt, pitchSentAt: p.pitchSentAt,
        lastOpenedAt: p.lastOpenedAt, liveAt: p.liveAt, pitchSlug: p.pitchSlug, client: { ...p.client },
      })),
      scorecards,
      redactions,
    };
  },
  async write<T>(w: TgOp): Promise<T | null> {
    const out = await (async (): Promise<unknown> => {
      switch (w.op) {
        case 'message':
          return { id: (await devAssist.addMessage({ projectId: null, channel: 'telegram', role: w.args.role, text: w.args.text, mode: w.args.mode as never, sources: (w.args.sources ?? []) as never })).id };
        case 'rule':
          return { id: (await devAssist.addRule(w.args.text, 'telegram')).id };
        case 'confirm_rule': {
          const r = await devAssist.updateRule(w.args.id, { confirmed: true });
          return r ? { id: r.id, text: r.text } : null;
        }
        case 'feedback':
          return devAssist.setFeedback(w.args.kind, w.args.id, w.args.rating).then(() => ({ ok: true }));
        case 'draft': {
          if (w.args.decision === 'editing') devEditing = w.args.id;
          if (w.args.decision === 'cancel_edit') devEditing = null;
          if (w.args.decision === 'approved' || w.args.decision === 'skipped') {
            devEditing = null;
            const d = await devAssist.decideDraft(w.args.id, w.args.decision, w.args.body);
            return d ? toRow(d) : null;
          }
          const d = (await devAssist.drafts()).find((x) => x.id === w.args.id);
          return d ? toRow(d) : null;
        }
        case 'add_drafts':
          return (await devAssist.addDrafts(w.args.rows)).map(toRow);
        case 'log':
          return devStore.addInteractions(w.args.rows.map((r) => ({ projectId: null, siteType: null, source: 'live', sourceRef: null, ...r }) as NewInteraction)).then(() => ({ ok: true }));
        default:
          return { ok: true };
      }
    })();
    return out as T | null;
  },
  match: (embedding, count) => devStore.matchChunks(embedding, count, null),
};
let devEditing: string | null = null;
const toRow = (d: Draft): DraftRow => ({
  id: d.id, project_id: d.projectId, kind: d.kind, channel: d.channel, recipient: d.recipient, title: d.title, why: d.why, body: d.body,
  final_body: d.finalBody, status: d.status, created_at: d.createdAt, decided_at: d.decidedAt,
});

export function tgBackend(): TgBackend {
  return isDevStore() ? devTg : supabaseTg();
}

/** The assistant's inputs on Telegram. */
export function tgDeps(state: TgState, backend: TgBackend): { deps: AssistDeps; draftDeps: DraftDeps } {
  const now = Date.now();
  const usable = state.providers.filter((p) => (!p.cooldownUntil || new Date(p.cooldownUntil).getTime() <= now) && (!p.dailyLimit || p.used < p.dailyLimit));
  const clients: ProviderClient[] = usable.map((p) => {
    const id = p.provider as AiProviderId;
    const d = PROVIDER_INFO[id].defaults;
    return makeClient(id, decryptSecret(p.ciphertext), { strong: p.models.strong || d.strong, light: p.models.light || d.light });
  });
  // Every request is recorded in the bank, like the studio's.
  const log: Pick<SonoAiStore, 'addInteractions' | 'getRedactions' | 'addRedactions'> = {
    addInteractions: async (rows) => void (await backend.write({ op: 'log', args: { rows } })),
    getRedactions: async () => [],
    addRedactions: async () => {},
  };
  const providers = recorded(
    forAssistant(clients, usable.map((p) => ({ provider: p.provider, dailyLimit: p.dailyLimit, used: p.used }))),
    { store: log as SonoAiStore, defer, context: async () => ({ projectId: null, siteType: null, client: {} }) },
  );
  const hooks: RouterHooks = {
    onRequest: (p) => void backend.write({ op: 'usage', args: { provider: p } }).catch(() => {}),
    onCooldown: (p, until) => void backend.write({ op: 'cooldown', args: { provider: p, until: until.toISOString() } }).catch(() => {}),
  };
  const gemini = usable.find((p) => p.provider === 'gemini');
  const geminiKey = gemini ? decryptSecret(gemini.ciphertext) : null;
  const geminiFree = providers.some((p) => p.id === 'gemini');
  const snapshot: Snapshot = { now: new Date().toISOString(), followUpDays: state.followUpDays, projects: state.projects };
  const deps: AssistDeps = {
    studioUrl: siteUrl(),
    providers,
    hooks,
    snapshot: async () => snapshot,
    rules: async () => state.rules,
    history: async () => state.history,
    scorecards: async () => state.scorecards,
    embedQuery: geminiKey ? geminiEmbedder(geminiKey, fetch, undefined, 'RETRIEVAL_QUERY') : null,
    match: async (v, n, projectId) => (await backend.match(v, projectId ? 20 : n)).filter((h) => !projectId || h.projectId === projectId).slice(0, n),
    redactions: async (id) => state.redactions.filter((r) => r.projectId === id),
    web: geminiKey && geminiFree ? geminiWebSearch(geminiKey, gemini!.models.light || PROVIDER_INFO.gemini.defaults.light) : null,
    logWeb: (row) => defer(async () => void (await backend.write({ op: 'log', args: { rows: [{ ...row, task: 'assistant', provider: 'gemini', system: 'web search' }] } }).catch(() => {}))),
  };
  return { deps, draftDeps: { providers, hooks, snapshot, rules: state.rules, voice: state.voice, pitchUrl } };
}
