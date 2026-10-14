import { describe, expect, it } from 'vitest';
import type { Project } from '@/lib/types';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import { handleUpdate, sendDailySummary } from './bot';
import { buildIndex, chunkText, geminiEmbedder, planIndex, wantedChunks, EMBED_DIMENSIONS } from './knowledge';
import { memoryStore } from './memory-store';
import type { KeyedStore } from './notify-store';
import { summaryItems, summaryMessage, type DailyFacts } from './summary';
import { telegram, type Telegram } from './telegram';

const NOW = '2026-10-13T07:00:00.000Z';
const ago = (days: number, hours = 0) => new Date(new Date(NOW).getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();

function facts(over: Partial<DailyFacts> = {}): DailyFacts {
  return { chatId: 42, followUpDays: 3, muted: [], since: ago(1), now: NOW, projects: [], opens: [], failedJobs: [], deployments: [], versions: [], usage: [], ...over };
}
const project = (id: string, name: string, over: Partial<DailyFacts['projects'][number]> = {}) => ({
  id, name, status: 'draft', createdAt: ago(1), updatedAt: ago(1), pitchSentAt: null, lastOpenedAt: null, liveAt: null, ...over,
});

describe('the morning summary', () => {
  it('sends nothing on a quiet day, and leaves routine numbers out', () => {
    const quiet = facts({ projects: [project('a', 'Kora Kitchen', { status: 'live', liveAt: ago(30) })], usage: [{ provider: 'groq', used: 120, limit: 1000 }] });
    expect(summaryItems(quiet).items).toEqual([]);
    expect(summaryMessage(quiet, 'https://studio.example')).toBeNull();
  });

  it('puts approvals first, then follow-ups, then failures, then the rest, five at most', () => {
    const f = facts({
      projects: [
        project('a', 'Kora Kitchen', { status: 'pitch_sent', pitchSentAt: ago(5), lastOpenedAt: ago(4) }),
        project('b', 'Maison Lune', { status: 'client_approved', updatedAt: ago(0, 3) }),
        project('c', 'Studio Nala', { status: 'pitch_sent', pitchSentAt: ago(2) }), // only two days: not yet
        project('d', 'Kick Lab', { status: 'draft', createdAt: ago(9), updatedAt: ago(8) }),
        project('e', 'Crumb & Co'),
        project('f', 'Wanderly'),
      ],
      opens: [{ projectId: 'c', openedAt: ago(0, 2) }, { projectId: 'c', openedAt: ago(0, 1) }],
      failedJobs: [{ projectId: 'e', at: ago(0, 5), error: 'x' }],
      deployments: [{ projectId: 'f', status: 'ready', at: ago(0, 4), url: null }],
      versions: [{ projectId: 'e', count: 3 }],
      usage: [{ provider: 'gemini', used: 450, limit: 500 }],
    });
    const { items, more } = summaryItems(f);
    expect(items.map((i) => i.kind)).toEqual(['approved', 'follow_up', 'build_failed', 'quota', 'pitch_opened']);
    expect(more).toBe(3); // deployed, stuck draft, site changed wait for the studio
    expect(items[1].text).toBe('Kora Kitchen: pitch sent 5 days ago, last opened 4 days ago, no reply. Time to follow up.');
    expect(items[4].text).toBe('Studio Nala: pitch opened 2 times.');

    const msg = summaryMessage(f, 'https://studio.example')!;
    expect(msg.html).toContain('1. Maison Lune approved the site. Next: deploy it. <a href="https://studio.example/projects/b">Open</a>');
    expect(msg.html).toContain('Crumb &amp; Co'); // escaped for Telegram
    expect(msg.html).toContain('3 more items on the');
    expect(msg.buttons[0].map((b) => b.data)).toEqual(['mute:approved', 'mute:follow_up', 'mute:build_failed', 'mute:quota', 'mute:pitch_opened']);

    // A thumbs-down leaves that kind out; the follow-up threshold is yours to set.
    expect(summaryItems({ ...f, muted: ['approved', 'quota'] }).items.map((i) => i.kind)).not.toContain('approved');
    expect(summaryItems({ ...f, followUpDays: 2 }).items.filter((i) => i.kind === 'follow_up')).toHaveLength(2);
  });
});

function fakeBot() {
  const sent: { chatId: number; html: string; buttons?: unknown }[] = [];
  const answers: string[] = [];
  const bot: Telegram = {
    send: async (chatId, html, buttons) => void sent.push({ chatId, html, buttons }),
    answerCallback: async (_id, text) => void answers.push(text),
    setWebhook: async () => {},
    username: async () => 'sono_bot',
  };
  return { bot, sent, answers };
}

function fakeKeyed(state: { chat: number | null; code: string; muted: string[]; claimed: Set<string>; facts: DailyFacts }): KeyedStore {
  return {
    claimAlert: async (_k, ref) => (state.chat && !state.claimed.has(ref) ? (state.claimed.add(ref), state.chat) : null),
    pitchAlert: async () => null,
    chat: async () => state.chat,
    linkTelegram: async (code, chatId) => (code === state.code ? ((state.chat = chatId), true) : false),
    mute: async (chatId, kind) => (chatId === state.chat ? (state.muted.push(kind), true) : false),
    daily: async (claim) => {
      if (!claim) return state.facts;
      if (!state.chat || state.claimed.has('summary')) return null;
      state.claimed.add('summary');
      return { ...state.facts, chatId: state.chat };
    },
  };
}

describe('the Telegram bot', () => {
  it('links your chat with the one-time code and ignores everyone else', async () => {
    const state = { chat: null as number | null, code: 'abc123XYZ', muted: [] as string[], claimed: new Set<string>(), facts: facts() };
    const store = fakeKeyed(state);
    const { bot, sent, answers } = fakeBot();
    const msg = (chatId: number, text: string) => ({ message: { chat: { id: chatId, type: 'private' }, text } });

    await handleUpdate(msg(7, '/start wrongcode1'), bot, store);
    await handleUpdate(msg(7, 'hello'), bot, store);
    expect(state.chat).toBeNull();
    expect(sent).toHaveLength(0); // strangers get no reply at all

    await handleUpdate(msg(42, '/start abc123XYZ'), bot, store);
    expect(state.chat).toBe(42);
    expect(sent[0].html).toMatch(/^✅ Connected/);

    // Only your chat reaches the assistant (here with nothing stored, so it says no provider is free).
    const assistedBy: number[] = [];
    const backend = () => ({
      state: async () => ({ providers: [], rules: [], history: [], editingDraft: null, voice: [], pendingFollowUps: [], followUpDays: 3, projects: [], scorecards: [], redactions: [] }),
      write: async () => (assistedBy.push(1), { id: '00000000-0000-4000-8000-000000000001' }) as never,
      match: async () => [],
    });
    await handleUpdate(msg(99, 'what is up'), bot, store, backend);
    expect(sent).toHaveLength(1);
    expect(assistedBy).toHaveLength(0);
    await handleUpdate(msg(42, 'what is up'), bot, store, backend);
    expect(sent).toHaveLength(2);
    expect(sent[1].html).toMatch(/quota for site builds/);

    // Thumbs-down from your chat mutes that kind; from another chat it does nothing.
    await handleUpdate({ callback_query: { id: 'q1', data: 'mute:stuck_draft', message: { chat: { id: 99 } } } }, bot, store);
    await handleUpdate({ callback_query: { id: 'q2', data: 'mute:not_a_kind', message: { chat: { id: 42 } } } }, bot, store);
    await handleUpdate({ callback_query: { id: 'q3', data: 'mute:stuck_draft', message: { chat: { id: 42 } } } }, bot, store);
    expect(state.muted).toEqual(['stuck_draft']);
    expect(answers[0]).toContain('Projects stuck in Draft');
  });

  it('sends the summary once a day, and nothing on a quiet day', async () => {
    const busy = facts({ projects: [project('b', 'Maison Lune', { status: 'client_approved', updatedAt: ago(0, 1) })] });
    const state = { chat: 42, code: '', muted: [], claimed: new Set<string>(), facts: busy };
    const { bot, sent } = fakeBot();
    expect(await sendDailySummary(fakeKeyed(state), bot)).toBe('sent');
    expect(await sendDailySummary(fakeKeyed(state), bot)).toBe('skipped');
    expect(sent).toHaveLength(1);
    expect(await sendDailySummary(fakeKeyed({ ...state, claimed: new Set(), facts: facts() }), bot)).toBe('quiet');
    expect(sent).toHaveLength(1);
  });

  it('talks to the Bot API with the token in the path and HTML messages', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, result: { username: 'sono_bot' } }));
    }) as unknown as typeof fetch;
    const t = telegram('123:abc', f, 'https://tg.test');
    await t.send(42, '<b>Hi</b>', [[{ text: '👎 1', data: 'mute:quota' }]]);
    await t.setWebhook('https://studio.example/api/sono-ai/telegram', 'secret');
    expect(calls[0].url).toBe('https://tg.test/bot123:abc/sendMessage');
    expect(calls[0].body).toMatchObject({ chat_id: 42, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '👎 1', callback_data: 'mute:quota' }]] } });
    expect(calls[1].body).toMatchObject({ secret_token: 'secret', allowed_updates: ['message', 'callback_query'] });
  });
});

describe('the knowledge search index', () => {
  it('cuts long text at natural boundaries', () => {
    const text = `${'First paragraph. '.repeat(30)}\n\n${'Second one here. '.repeat(30)}\n\nShort end.`;
    const chunks = chunkText(text, 600);
    expect(chunks.every((c) => c.length <= 600)).toBe(true);
    expect(chunks.join(' ')).toContain('Short end.');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('indexes redacted records, re-embeds only what changed, and drops what is gone', async () => {
    const kora = {
      id: 'p1', name: 'Kora Kitchen', businessType: 'Restaurant', siteType: 'booking', status: 'pitch_sent', preset: 'warm-table', headline: 'Slow-cooked family recipes',
      pitchSentAt: '2026-10-10T09:00:00Z', lastOpenedAt: null, liveAt: null, liveUrl: null,
      client: { ownerName: 'Amara Osei', whatsapp: '+1 555 214 0090', instagram: '@korakitchen', address: '14 Mill Lane', notes: 'Met Amara at the market. Call +1 555 214 0090 after 5pm.' },
    } as unknown as Project;
    const studio = { listProjects: async () => [kora], getSiteVersion: async () => ({ config: KORA_KITCHEN }) };
    const store = memoryStore();
    await store.addOutcomes([{ projectId: 'p1', interactionId: null, kind: 'pitch_opened', version: null, detail: 'mobile', key: 'k1', happenedAt: '2026-10-11T10:00:00Z' }]);
    let calls = 0;
    const embed = async (texts: string[]) => (calls++, texts.map(() => Array(EMBED_DIMENSIONS).fill(0.1)));

    const first = await buildIndex(studio, store, embed);
    expect(first).toMatchObject({ changed: first.chunks, removed: 0, embedded: first.chunks, waiting: 0 });
    expect(store.chunks.map((c) => c.source).sort()).toEqual(['client_notes', 'outcomes', 'project']);
    const all = store.chunks.map((c) => c.content).join('\n');
    expect(all).not.toMatch(/Kora|Amara|555/);
    expect(all).toContain('Client A');
    expect(all).toContain('Page Menu (/menu)');
    expect(all).toContain('pitch opened on 2026-10-11 (mobile)');

    // Nothing changed: nothing rewritten or re-embedded.
    const again = await buildIndex(studio, store, embed);
    expect(again).toMatchObject({ changed: 0, removed: 0, embedded: 0 });
    expect(calls).toBe(1);

    // Notes cleared: their chunk goes. Without an embedder, new chunks wait.
    kora.client.notes = '';
    kora.status = 'client_approved';
    const third = await buildIndex(studio, store, null);
    expect(third).toMatchObject({ changed: 1, removed: 1, embedded: 0, waiting: 1 });
    expect(store.chunks.map((c) => c.source).sort()).toEqual(['outcomes', 'project']);
  });

  it('asks Gemini for 768-dimension document embeddings', async () => {
    let sent: { url: string; body: { requests: Record<string, unknown>[] }; key: string | null } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get('x-goog-api-key') };
      return new Response(JSON.stringify({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] }));
    }) as unknown as typeof fetch;
    expect(await geminiEmbedder('AIza-test', f, 'https://g.test')(['one', 'two'])).toEqual([[1, 2], [3, 4]]);
    expect(sent!.url).toBe('https://g.test/models/gemini-embedding-001:batchEmbedContents');
    expect(sent!.key).toBe('AIza-test');
    expect(sent!.body.requests[1]).toEqual({ model: 'models/gemini-embedding-001', content: { parts: [{ text: 'two' }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 });
  });

  it('plans only the differences', () => {
    const wanted = wantedChunks([{ projectId: 'p', source: 'project', sourceId: 'p', text: 'one' }]);
    const existing = [{ ...wanted[0], id: 'x', embedded: true }, { ...wanted[0], id: 'y', chunk: 1, embedded: true }];
    expect(planIndex(existing, wanted)).toEqual({ save: [], remove: ['y'] });
  });
});
