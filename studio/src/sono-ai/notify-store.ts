import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverSecret } from '@/lib/crypto';
import { isDevStore, supabaseEnv } from '@/lib/env';
import { devRepo } from '@/lib/data/dev-repo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DailyFacts } from './summary';

/*
 * Stage 2 storage. Two halves:
 * - Keyed: work with no signed-in user (the morning summary, Telegram, a
 *   pitch being opened) calls narrow database functions with the server's
 *   Sono AI key.
 * - Settings: your Telegram link and preferences, read and changed while
 *   signed in, like the rest of the studio.
 */

export interface SonoAiSettings {
  telegramChatId: number | null;
  timezone: string;
  followUpDays: number;
  muted: string[];
  lastSummaryAt: string | null;
  lastIndexedAt: string | null;
}

export const DEFAULT_SETTINGS: SonoAiSettings = { telegramChatId: null, timezone: 'Africa/Lagos', followUpDays: 3, muted: [], lastSummaryAt: null, lastIndexedAt: null };

export interface KeyedStore {
  /** Records an alert once; the chat to send it to, or null if sent before or Telegram isn't linked. */
  claimAlert(kind: string, ref: string): Promise<number | null>;
  /** A pitch link's first real open, once. */
  pitchAlert(slug: string): Promise<{ chatId: number; projectId: string; name: string; device: string } | null>;
  chat(): Promise<number | null>;
  linkTelegram(code: string, chatId: number): Promise<boolean>;
  mute(chatId: number, kind: string): Promise<boolean>;
  /** With claim, marks today's summary sent and returns null if it already was. */
  daily(claim: boolean): Promise<DailyFacts | null>;
}

export interface SettingsStore {
  get(): Promise<SonoAiSettings>;
  /** Saves the hash of the server's key, so the keyed functions recognise it. */
  registerKey(): Promise<void>;
  setLinkCode(code: string, expiresAt: string): Promise<void>;
  update(patch: Partial<Pick<SonoAiSettings, 'telegramChatId' | 'followUpDays' | 'muted' | 'lastIndexedAt'>>): Promise<void>;
}

/** The key the keyed functions need; derived from the server's encryption key, never stored. */
export const sonoAiKey = () => serverSecret('sono-ai');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/* ---------- Supabase ---------- */

function anonDb(): SupabaseClient {
  const env = supabaseEnv()!;
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function keyedSupabase(db: SupabaseClient): KeyedStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(fn, { p_key: sonoAiKey(), ...args });
    if (error) throw new Error(`Sono AI: ${error.message}`);
    return data as T;
  };
  return {
    claimAlert: async (kind, ref) => (await rpc<number | string | null>('sono_ai_claim_alert', { p_kind: kind, p_ref: ref })) as number | null,
    pitchAlert: (slug) => rpc('sono_ai_pitch_alert', { p_slug: slug }),
    chat: async () => {
      const c = await rpc<number | string | null>('sono_ai_chat', {});
      return c === null ? null : Number(c);
    },
    linkTelegram: (code, chatId) => rpc('sono_ai_link_telegram', { p_code: code, p_chat_id: chatId }),
    mute: (chatId, kind) => rpc('sono_ai_mute', { p_chat_id: chatId, p_kind: kind }),
    daily: (claim) => rpc('sono_ai_daily', { p_claim: claim }),
  };
}

type SettingsRow = { telegram_chat_id: number | string | null; timezone: string; follow_up_days: number; muted: string[]; last_summary_at: string | null; last_indexed_at: string | null };

function settingsSupabase(db: SupabaseClient): SettingsStore {
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(`Sono AI settings: ${error.message}`);
  };
  return {
    async get() {
      const { data, error } = await db.from('sono_ai_settings').select('telegram_chat_id, timezone, follow_up_days, muted, last_summary_at, last_indexed_at').maybeSingle();
      check(error);
      const r = data as SettingsRow | null;
      return r
        ? { telegramChatId: r.telegram_chat_id === null ? null : Number(r.telegram_chat_id), timezone: r.timezone, followUpDays: r.follow_up_days, muted: r.muted ?? [], lastSummaryAt: r.last_summary_at, lastIndexedAt: r.last_indexed_at }
        : DEFAULT_SETTINGS;
    },
    async registerKey() {
      const { error } = await db.from('sono_ai_settings').upsert({ key_hash: sha256(sonoAiKey()) }, { onConflict: 'owner_id' });
      check(error);
    },
    async setLinkCode(code, expiresAt) {
      const { error } = await db.from('sono_ai_settings').upsert({ link_code_hash: sha256(code), link_expires_at: expiresAt }, { onConflict: 'owner_id' });
      check(error);
    },
    async update(patch) {
      const row: Record<string, unknown> = {};
      if ('telegramChatId' in patch) row.telegram_chat_id = patch.telegramChatId;
      if (patch.followUpDays !== undefined) row.follow_up_days = patch.followUpDays;
      if (patch.muted !== undefined) row.muted = patch.muted;
      if (patch.lastIndexedAt !== undefined) row.last_indexed_at = patch.lastIndexedAt;
      const { error } = await db.from('sono_ai_settings').upsert(row, { onConflict: 'owner_id' });
      check(error);
    },
  };
}

/* ---------- Local file (development without Supabase) ---------- */

interface DevNotify {
  settings: SonoAiSettings & { linkCodeHash?: string | null; linkExpiresAt?: string | null };
  alerts: string[];
}
const FILE = path.join(process.cwd(), '.data', 'sono-ai-notify.json');
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DevNotify> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as DevNotify;
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, alerts: [] };
  }
}
function change<T>(fn: (d: DevNotify) => T): Promise<T> {
  const next = queue.then(async () => {
    const d = await load();
    const out = fn(d);
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(`${FILE}.tmp`, JSON.stringify(d, null, 1));
    await rename(`${FILE}.tmp`, FILE);
    return out;
  });
  queue = next.catch(() => {});
  return next;
}

const dateIn = (tz: string, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Builds the same facts the database function returns, from the dev store. */
async function devFacts(s: SonoAiSettings): Promise<DailyFacts> {
  const now = new Date();
  const since = new Date(Math.max(s.lastSummaryAt ? new Date(s.lastSummaryAt).getTime() : now.getTime() - 86_400_000, now.getTime() - 3 * 86_400_000)).toISOString();
  const projects = await devRepo.listProjects();
  const facts: DailyFacts = { chatId: s.telegramChatId, followUpDays: s.followUpDays, muted: s.muted, since, now: now.toISOString(), projects: [], opens: [], failedJobs: [], deployments: [], versions: [], usage: [] };
  for (const p of projects) {
    facts.projects.push({ id: p.id, name: p.name, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt, pitchSentAt: p.pitchSentAt, lastOpenedAt: p.lastOpenedAt, liveAt: p.liveAt });
    for (const e of await devRepo.listPitchEvents(p.id, 500)) if (!e.isBot && e.openedAt > since) facts.opens.push({ projectId: p.id, openedAt: e.openedAt });
    const job = await devRepo.getLatestJob(p.id);
    if (job?.status === 'failed' && job.updatedAt > since) facts.failedJobs.push({ projectId: p.id, at: job.updatedAt, error: job.error });
    const d = await devRepo.getLatestDeployment(p.id);
    if (d && d.status !== 'building' && d.updatedAt > since) facts.deployments.push({ projectId: p.id, status: d.status, at: d.updatedAt, url: d.url });
    const n = (await devRepo.listSiteVersions(p.id, 500)).filter((v) => v.createdAt > since).length;
    if (n) facts.versions.push({ projectId: p.id, count: n });
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const k of await devRepo.listProviderKeys())
    if (k.dailyLimit) facts.usage.push({ provider: k.provider, used: k.usageDay === today ? k.usageCount : 0, limit: k.dailyLimit });
  return facts;
}

const keyedDev: KeyedStore = {
  claimAlert: (_kind, ref) =>
    change((d) => {
      if (!d.settings.telegramChatId || d.alerts.includes(ref)) return null;
      d.alerts.push(ref);
      return d.settings.telegramChatId;
    }),
  async pitchAlert(slug) {
    const p = (await devRepo.listProjects()).find((x) => x.pitchSlug === slug);
    if (!p) return null;
    const real = (await devRepo.listPitchEvents(p.id, 500)).filter((e) => !e.isBot);
    if (real.length !== 1) return null;
    const chatId = await keyedDev.claimAlert('pitch_opened', `pitch_open:${p.id}`);
    return chatId ? { chatId, projectId: p.id, name: p.name, device: real[0].device } : null;
  },
  chat: async () => (await load()).settings.telegramChatId,
  linkTelegram: (code, chatId) =>
    change((d) => {
      const s = d.settings;
      if (!s.linkCodeHash || s.linkCodeHash !== sha256(code) || !s.linkExpiresAt || s.linkExpiresAt < new Date().toISOString()) return false;
      Object.assign(s, { telegramChatId: chatId, linkCodeHash: null, linkExpiresAt: null });
      return true;
    }),
  mute: (chatId, kind) =>
    change((d) => {
      if (d.settings.telegramChatId !== chatId) return false;
      d.settings.muted = [...new Set([...d.settings.muted, kind])];
      return true;
    }),
  async daily(claim) {
    if (claim) {
      const ok = await change((d) => {
        const ref = `summary:${dateIn(d.settings.timezone)}`;
        if (!d.settings.telegramChatId || d.alerts.includes(ref)) return false;
        d.alerts.push(ref);
        return true;
      });
      if (!ok) return null;
      const s = (await load()).settings;
      const facts = await devFacts(s);
      await change((d) => void (d.settings.lastSummaryAt = facts.now));
      return facts;
    }
    return devFacts((await load()).settings);
  },
};

const settingsDev: SettingsStore = {
  get: async () => {
    const { linkCodeHash: _a, linkExpiresAt: _b, ...s } = (await load()).settings;
    return { ...DEFAULT_SETTINGS, ...s };
  },
  registerKey: async () => {},
  setLinkCode: (code, expiresAt) => change((d) => void Object.assign(d.settings, { linkCodeHash: sha256(code), linkExpiresAt: expiresAt })),
  update: (patch) => change((d) => void Object.assign(d.settings, patch)),
};

/** For routes with no signed-in user (cron, Telegram, pitch pages). */
export function keyedStore(): KeyedStore {
  return isDevStore() ? keyedDev : keyedSupabase(anonDb());
}

/** For the signed-in owner. */
export async function settingsStore(): Promise<SettingsStore> {
  return isDevStore() ? settingsDev : settingsSupabase(await createSupabaseServerClient());
}

/** Signed-in callers can use the keyed functions too (they need no session). */
export async function keyedStoreSignedIn(): Promise<KeyedStore> {
  return isDevStore() ? keyedDev : keyedSupabase(await createSupabaseServerClient());
}
