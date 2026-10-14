import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isDevStore } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Draft, DraftDecision, Message, NewDraft, NewMessage, Rule, ScoreRow } from './types';

/*
 * Stage 3 storage, for the signed-in owner: conversations with Sono AI, its
 * drafts, your feedback and rules, and model scorecards.
 */

export interface AssistStore {
  messages(channel: Message['channel'], limit?: number): Promise<Message[]>;
  addMessage(m: NewMessage): Promise<Message>;
  drafts(status?: Draft['status']): Promise<Draft[]>;
  addDrafts(rows: NewDraft[]): Promise<Draft[]>;
  decideDraft(id: string, decision: DraftDecision, body?: string): Promise<Draft | null>;
  /** Approved drafts you edited: examples of how you write. */
  voice(limit?: number): Promise<string[]>;
  setFeedback(kind: 'reply' | 'draft', id: string, rating: 1 | -1): Promise<void>;
  feedback(): Promise<{ kind: 'reply' | 'draft'; id: string; rating: 1 | -1 }[]>;
  rules(): Promise<Rule[]>;
  addRule(text: string, source: Rule['source']): Promise<Rule>;
  updateRule(id: string, patch: Partial<Pick<Rule, 'enabled' | 'confirmed'>>): Promise<Rule | null>;
  deleteRule(id: string): Promise<void>;
  scorecards(): Promise<(ScoreRow & { updatedAt: string })[]>;
  saveScorecards(rows: ScoreRow[]): Promise<void>;
}

/* ---------- Supabase ---------- */

type MessageRow = { id: string; project_id: string | null; channel: Message['channel']; role: Message['role']; text: string; mode: Message['mode']; sources: Message['sources']; created_at: string };
type DraftRow = {
  id: string; project_id: string | null; kind: Draft['kind']; channel: Draft['channel']; recipient: string; title: string; why: string; body: string;
  final_body: string | null; status: Draft['status']; created_at: string; decided_at: string | null;
};
type RuleRow = { id: string; text: string; enabled: boolean; confirmed: boolean; source: Rule['source']; created_at: string };

const message = (r: MessageRow): Message => ({ id: r.id, projectId: r.project_id, channel: r.channel, role: r.role, text: r.text, mode: r.mode, sources: r.sources ?? [], createdAt: r.created_at });
const draft = (r: DraftRow): Draft => ({
  id: r.id, projectId: r.project_id, kind: r.kind, channel: r.channel, recipient: r.recipient, title: r.title, why: r.why, body: r.body,
  finalBody: r.final_body, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at,
});
const rule = (r: RuleRow): Rule => ({ id: r.id, text: r.text, enabled: r.enabled, confirmed: r.confirmed, source: r.source, createdAt: r.created_at });

function supabaseAssist(db: SupabaseClient): AssistStore {
  const check = <T>(res: { data: T; error: { message: string } | null }): T => {
    if (res.error) throw new Error(`Sono AI: ${res.error.message}`);
    return res.data;
  };
  return {
    async messages(channel, limit = 40) {
      const rows = check(await db.from('conversations').select('*').eq('channel', channel).order('created_at', { ascending: false }).limit(limit)) as MessageRow[];
      return rows.reverse().map(message);
    },
    async addMessage(m) {
      const row = check(
        await db.from('conversations').insert({ project_id: m.projectId, channel: m.channel, role: m.role, text: m.text.slice(0, 8000), mode: m.mode, sources: m.sources }).select('*').single(),
      ) as MessageRow;
      return message(row);
    },
    async drafts(status) {
      let q = db.from('assistant_drafts').select('*').order('created_at', { ascending: false }).limit(100);
      if (status) q = q.eq('status', status);
      return (check(await q) as DraftRow[]).map(draft);
    },
    async addDrafts(rows) {
      if (!rows.length) return [];
      const out = check(
        await db
          .from('assistant_drafts')
          .insert(rows.map((d) => ({ project_id: d.projectId, kind: d.kind, channel: d.channel, recipient: d.recipient, title: d.title, why: d.why, body: d.body })))
          .select('*'),
      ) as DraftRow[];
      return out.map(draft);
    },
    async decideDraft(id, decision, body) {
      const patch = { status: decision, decided_at: new Date().toISOString(), ...(body !== undefined ? { final_body: body.slice(0, 6000) } : {}) };
      const rows = check(await db.from('assistant_drafts').update(patch).eq('id', id).eq('status', 'pending').select('*')) as DraftRow[];
      return rows[0] ? draft(rows[0]) : null;
    },
    async voice(limit = 5) {
      const rows = check(
        await db.from('assistant_drafts').select('final_body').eq('kind', 'follow_up').eq('status', 'approved').not('final_body', 'is', null).order('decided_at', { ascending: false }).limit(limit),
      ) as { final_body: string }[];
      return rows.map((r) => r.final_body);
    },
    async setFeedback(kind, id, rating) {
      check(await db.from('feedback').upsert({ target_kind: kind, target_id: id, rating }, { onConflict: 'owner_id,target_kind,target_id' }));
    },
    async feedback() {
      const rows = check(await db.from('feedback').select('target_kind, target_id, rating').limit(1000)) as { target_kind: 'reply' | 'draft'; target_id: string; rating: 1 | -1 }[];
      return rows.map((r) => ({ kind: r.target_kind, id: r.target_id, rating: r.rating }));
    },
    async rules() {
      return (check(await db.from('rules').select('*').order('created_at')) as RuleRow[]).map(rule);
    },
    async addRule(text, source) {
      return rule(check(await db.from('rules').insert({ text: text.slice(0, 500), source, confirmed: false }).select('*').single()) as RuleRow);
    },
    async updateRule(id, patch) {
      const rows = check(await db.from('rules').update(patch).eq('id', id).select('*')) as RuleRow[];
      return rows[0] ? rule(rows[0]) : null;
    },
    async deleteRule(id) {
      check(await db.from('rules').delete().eq('id', id));
    },
    async scorecards() {
      const rows = check(await db.from('scorecards').select('*')) as (Record<string, unknown> & { updated_at: string })[];
      return rows.map((r) => ({
        task: r.task as string, provider: r.provider as string, model: r.model as string, requests: r.requests as number, failures: r.failures as number,
        kept: r.kept as number, edited: r.edited as number, undone: r.undone as number, regenerated: r.regenerated as number, updatedAt: r.updated_at,
      }));
    },
    async saveScorecards(rows) {
      check(await db.from('scorecards').delete().gte('requests', 0));
      if (rows.length) check(await db.from('scorecards').insert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }))));
    },
  };
}

/* ---------- Local file (development without Supabase) ---------- */

interface DevAssist {
  messages: Message[];
  drafts: Draft[];
  feedback: { kind: 'reply' | 'draft'; id: string; rating: 1 | -1 }[];
  rules: Rule[];
  scorecards: (ScoreRow & { updatedAt: string })[];
}
const FILE = path.join(process.cwd(), '.data', 'sono-ai-assist.json');
let queue: Promise<unknown> = Promise.resolve();
async function load(): Promise<DevAssist> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as DevAssist;
  } catch {
    return { messages: [], drafts: [], feedback: [], rules: [], scorecards: [] };
  }
}
function change<T>(fn: (d: DevAssist) => T): Promise<T> {
  const next = queue.then(async () => {
    const d = await load();
    const out = fn(d);
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(`${FILE}.tmp`, JSON.stringify(d));
    await rename(`${FILE}.tmp`, FILE);
    return out;
  });
  queue = next.catch(() => {});
  return next;
}
const now = () => new Date().toISOString();

export const devAssist: AssistStore = {
  messages: async (channel, limit = 40) => (await load()).messages.filter((m) => m.channel === channel).slice(-limit),
  addMessage: (m) => change((d) => {
    const row = { ...m, id: randomUUID(), createdAt: now() };
    d.messages.push(row);
    return row;
  }),
  drafts: async (status) => (await load()).drafts.filter((x) => !status || x.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  addDrafts: (rows) => change((d) => {
    const out = rows.map((r) => ({ ...r, id: randomUUID(), finalBody: null, status: 'pending' as const, createdAt: now(), decidedAt: null }));
    d.drafts.push(...out);
    return out;
  }),
  decideDraft: (id, decision, body) => change((d) => {
    const x = d.drafts.find((r) => r.id === id && r.status === 'pending');
    if (!x) return null;
    Object.assign(x, { status: decision, decidedAt: now(), ...(body !== undefined ? { finalBody: body } : {}) });
    return x;
  }),
  voice: async (limit = 5) =>
    (await load()).drafts
      .filter((x) => x.kind === 'follow_up' && x.status === 'approved' && x.finalBody)
      .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
      .slice(0, limit)
      .map((x) => x.finalBody!),
  setFeedback: (kind, id, rating) => change((d) => {
    d.feedback = d.feedback.filter((f) => !(f.kind === kind && f.id === id));
    d.feedback.push({ kind, id, rating });
  }),
  feedback: async () => (await load()).feedback,
  rules: async () => (await load()).rules,
  addRule: (text, source) => change((d) => {
    const r = { id: randomUUID(), text: text.slice(0, 500), enabled: true, confirmed: false, source, createdAt: now() };
    d.rules.push(r);
    return r;
  }),
  updateRule: (id, patch) => change((d) => {
    const r = d.rules.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    return r ?? null;
  }),
  deleteRule: (id) => change((d) => void (d.rules = d.rules.filter((r) => r.id !== id))),
  scorecards: async () => (await load()).scorecards,
  saveScorecards: (rows) => change((d) => void (d.scorecards = rows.map((r) => ({ ...r, updatedAt: now() })))),
};

export async function assistStore(): Promise<AssistStore> {
  return isDevStore() ? devAssist : supabaseAssist(await createSupabaseServerClient());
}
