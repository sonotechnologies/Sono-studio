import { describe, expect, it } from 'vitest';
import type { ChatRequest, ProviderClient } from '@/ai/types';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import type { Telegram } from '../telegram';
import { computeScorecards, factsText, keepRate, leadStats, type Snapshot, type SnapshotProject } from './context';
import { approveHref, checklistDraft, followUpDrafts, quoteDraft, recipientOf } from './drafts';
import { answer, type AssistDeps } from './engine';
import { draftAsk, pickMode, ruleIn } from './modes';
import { forAssistant } from './reserve';
import type { TgBackend, TgOp, TgState } from './telegram-assist';
import { assistButton, ownerMessage } from './telegram-chat';
import type { Draft } from './types';

const NOW = '2026-10-14T09:00:00.000Z';
const ago = (d: number) => new Date(new Date(NOW).getTime() - d * 86_400_000).toISOString();
const project = (id: string, name: string, over: Partial<SnapshotProject> = {}): SnapshotProject => ({
  id, name, businessType: 'Restaurant', siteType: 'showcase', status: 'draft', createdAt: ago(20), pitchSentAt: null, lastOpenedAt: null, liveAt: null,
  pitchSlug: `${name.toLowerCase().replace(/\W+/g, '-')}-abcd`, client: { ownerName: '', whatsapp: '', instagram: '', address: '' }, ...over,
});
const snapshot: Snapshot = {
  now: NOW,
  followUpDays: 3,
  projects: [
    project('p1', 'Kora Kitchen', { status: 'pitch_sent', pitchSentAt: ago(5), client: { ownerName: 'Amara Osei', whatsapp: '+234 803 000 0000', instagram: '@korakitchen', address: '' } }),
    project('p2', 'Maison Lune', { businessType: 'Hotel', status: 'live', pitchSentAt: ago(40), lastOpenedAt: ago(38), liveAt: ago(10), client: { ownerName: 'Léa Martin', whatsapp: '', instagram: '@maisonlune', address: '' } }),
    project('p3', 'Studio Nala', { businessType: 'Salon', status: 'pitch_sent', pitchSentAt: ago(1) }),
  ],
};

/** A provider that answers with the given JSON and remembers what it was asked. */
function provider(reply: (req: ChatRequest) => unknown) {
  const asked: ChatRequest[] = [];
  const client: ProviderClient = { id: 'groq', models: { strong: 's', light: 'l' }, chat: async (req) => (asked.push(req), { text: JSON.stringify(reply(req)), model: 'l' }) };
  return { client, asked };
}

function deps(over: Partial<AssistDeps> & { providers: ProviderClient[] }): AssistDeps {
  return {
    studioUrl: 'https://studio.example',
    hooks: {},
    snapshot: async () => snapshot,
    rules: async () => ['Always quote in dollars for UK clients'],
    history: async () => [{ role: 'user', text: 'Hi, how is Amara doing?' }],
    scorecards: async () => [],
    embedQuery: null,
    match: async () => [],
    redactions: async () => [],
    web: null,
    ...over,
  };
}

describe('picking how to answer', () => {
  it('spots rules, draft requests, web questions and studio questions without a request', () => {
    expect(ruleIn('Always quote in dollars for UK clients')).toBe('Always quote in dollars for UK clients');
    expect(ruleIn('remember that Kora prefers Instagram')).toBe('Kora prefers Instagram');
    expect(ruleIn('Rule: keep follow-ups short')).toBe('Keep follow-ups short');
    expect(ruleIn('what should I always do?')).toBeNull();
    expect(draftAsk('Draft follow-ups')).toEqual({ kind: 'follow_up' });
    expect(draftAsk('write a quote for Kora Kitchen')).toEqual({ kind: 'quote' });
    expect(draftAsk('make the handover checklist')).toEqual({ kind: 'checklist' });
    expect(draftAsk('who needs a follow-up?')).toBeNull();
    expect(pickMode('what is the latest Next.js release?')).toBe('search');
    expect(pickMode('how many pitches did I send this month?')).toBe('studio');
    expect(pickMode('how is Maison Lune doing', ['Maison Lune'])).toBe('studio');
    expect(pickMode('tell me a joke about pasta')).toBe('casual');
    expect(pickMode('what is the dollar to naira rate today, currently?')).toBe('search');
    expect(pickMode('has black clover season 2 been released')).toBe('search');
    expect(pickMode('check, it does')).toBe('search');
    expect(pickMode('check which pitches were opened')).toBe('studio');
  });
});

describe('studio facts', () => {
  it('works out the numbers in code, so the model only words them', () => {
    const text = factsText(snapshot);
    expect(text).toContain('Pitches sent this month (2026-10): 2; last month (2026-09): 1.');
    expect(text).toContain('Needing a follow-up (no reply for 3+ days): Kora Kitchen.');
    expect(leadStats(snapshot.projects)[0]).toMatchObject({ businessType: 'Hotel', approved: 1, live: 1 });
  });

  it('scores each model by what came of its answers', () => {
    const i = (id: string, provider: string, status: 'ok' | 'error' = 'ok') => ({ id, task: 'fill', provider, model: 'm', status }) as never;
    const rows = computeScorecards([i('a', 'groq'), i('b', 'groq'), i('c', 'groq', 'error'), i('d', 'gemini')], [
      { interactionId: 'a', kind: 'kept' }, { interactionId: 'a', kind: 'edited' }, { interactionId: 'b', kind: 'undone' }, { interactionId: 'd', kind: 'kept' },
    ] as never);
    const groq = rows.find((r) => r.provider === 'groq')!;
    expect(groq).toMatchObject({ requests: 3, failures: 1, kept: 1, edited: 1, undone: 1 });
    expect(keepRate(groq)).toBe(0.5);
    expect(keepRate(rows.find((r) => r.provider === 'gemini')!)).toBe(1);
  });
});

describe('answers', () => {
  it('answers studio questions from redacted context, with links to what it used', async () => {
    const p = provider(() => ({ reply: 'Client A (owner Person 1) needs a follow-up; Client B is live.', sources: [1, 3, 9] }));
    const a = await answer(
      'How is Kora Kitchen doing? Amara hasn’t replied',
      deps({
        providers: [p.client],
        embedQuery: async () => [[1, 0]],
        // Index chunks use each project's own placeholders: here "Client A" is Kora Kitchen's.
        match: async () => [{ projectId: 'p1', source: 'client_notes', sourceId: 'p1', content: 'Notes on Client A: met at the market.', similarity: 0.8 }, { projectId: 'p2', source: 'project', sourceId: 'p2', content: 'Unrelated', similarity: 0.2 }],
        redactions: async () => [{ placeholder: 'Client A', kind: 'business', value: 'Kora Kitchen' }],
      }),
    );
    expect(a).toMatchObject({ kind: 'reply', mode: 'studio' });
    if (a.kind !== 'reply') return;
    expect(a.reply).toBe('Kora Kitchen (owner Amara Osei) needs a follow-up; Maison Lune is live.');
    expect(a.sources).toEqual([
      { label: 'Studio data', href: 'https://studio.example/' },
      { label: 'Kora Kitchen · client notes', href: 'https://studio.example/projects/p1' },
    ]);
    const sent = p.asked[0].system + p.asked[0].prompt;
    expect(sent).not.toMatch(/Kora|Amara|Maison|Léa|803 000/);
    expect(sent).toContain('[3] Notes on Client A: met at the market.');
    expect(sent).not.toContain('Unrelated'); // not close enough in meaning
    expect(sent).toContain('Always quote in dollars for UK clients');
    expect(p.asked[0].task).toBe('assistant');
  });

  it('keeps everyday chat free of studio data, and uses the web only through search', async () => {
    const p = provider(() => ({ reply: 'Here is one: why did the pasta …' }));
    const casual = await answer('tell me a joke', deps({ providers: [p.client] }));
    expect(casual).toMatchObject({ kind: 'reply', mode: 'casual' });
    expect(p.asked[0].system).not.toContain('Projects:');

    const noKey = await answer('latest Next.js release?', deps({ providers: [p.client] }));
    expect(noKey).toMatchObject({ kind: 'reply', mode: 'search', reply: expect.stringContaining('needs a Gemini key') });

    const queries: string[] = [];
    const logged: unknown[] = [];
    const web = await answer(
      'search for what Kora Kitchen’s competitors charge',
      deps({ providers: [p.client], web: async (q) => (queries.push(q), { text: 'Client A’s rivals charge ₦20,000.', sources: [{ label: 'example.com', href: 'https://example.com' }], model: 'g', inputTokens: 1, outputTokens: 1 }), logWeb: (r) => logged.push(r) }),
    );
    expect(queries[0]).not.toContain('Kora');
    expect(web).toMatchObject({ kind: 'reply', mode: 'search', reply: 'Kora Kitchen’s rivals charge ₦20,000.', sources: [{ label: 'example.com' }] });
    expect(logged).toHaveLength(1);
  });

  it('hands everyday questions that need current facts over to web search instead of guessing', async () => {
    const p = provider(() => ({ search: true }));
    const asked: string[] = [];
    const a = await answer('is the new iPhone any good', deps({ providers: [p.client], web: async (q) => (asked.push(q), { text: 'Reviews are positive.', sources: [], model: 'g', inputTokens: null, outputTokens: null }) }));
    expect(a).toMatchObject({ kind: 'reply', mode: 'search', reply: 'Reviews are positive.' });
    expect(asked[0]).toContain('Conversation so far'); // follow-ups are understood from the conversation
    expect(p.asked[0].system).toContain('{"search": true}');
  });

  it('repeats a rule back before saving it, and hands draft requests on', async () => {
    const p = provider(() => ({ reply: 'x' }));
    expect(await answer('From now on, never send pitches on Sundays', deps({ providers: [p.client] }))).toMatchObject({ kind: 'rule', rule: 'Never send pitches on Sundays' });
    expect(await answer('draft follow-ups please', deps({ providers: [p.client] }))).toEqual({ kind: 'draft', ask: { kind: 'follow_up' } });
    expect(p.asked).toHaveLength(0);
  });

  it('leaves builds their share of each provider’s daily quota', () => {
    const a = { id: 'groq', models: { strong: 's', light: 'l' }, chat: async () => ({ text: '', model: '' }) } as ProviderClient;
    const b = { ...a, id: 'gemini' } as ProviderClient;
    expect(forAssistant([a, b], [{ provider: 'groq', dailyLimit: 100, used: 70 }, { provider: 'gemini', dailyLimit: 100, used: 69 }]).map((p) => p.id)).toEqual(['gemini']);
    expect(forAssistant([a], [{ provider: 'groq', dailyLimit: null, used: 900 }])).toHaveLength(1);
  });
});

describe('drafts', () => {
  const draftDeps = (client: ProviderClient, voice: string[] = []) => ({ providers: [client], hooks: {}, snapshot, rules: ['Sign off as Tobi'], voice, pitchUrl: (s: string) => `https://studio.example/p/${s}` });

  it('writes follow-ups only for pitches that need one, in your voice, with the pitch link', async () => {
    const p = provider(() => ({ message: 'Hi Person 1! Did you get a chance to see the site for Client A? [PITCH LINK] — Tobi' }));
    const rows = await followUpDrafts(draftDeps(p.client, ['Hey Person 2, quick nudge on the site 🙂']), []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ projectId: 'p1', kind: 'follow_up', channel: 'whatsapp', recipient: '+234 803 000 0000', title: 'Follow up with Kora Kitchen', why: 'Pitch sent 5 days ago, not opened yet, no reply.' });
    expect(rows[0].body).toBe('Hi Amara Osei! Did you get a chance to see the site for Kora Kitchen? https://studio.example/p/kora-kitchen-abcd — Tobi');
    const sent = p.asked[0].system + p.asked[0].prompt;
    expect(sent).not.toMatch(/Kora|Amara|803/);
    expect(sent).toContain('quick nudge on the site');
    expect(sent).toContain('Sign off as Tobi');
    // One already waiting: nothing new.
    expect(await followUpDrafts(draftDeps(p.client), [{ kind: 'follow_up', status: 'pending', projectId: 'p1' } as Draft])).toEqual([]);
  });

  it('prices quotes from the site’s modules, and lists what a site needs before going live', async () => {
    const p = provider(() => ({ price: 300000, currency: 'ngn', scope: ['Five pages', 'Online bookings'], message: 'Here is your quote, Person 1.' }));
    const q = await quoteDraft(draftDeps(p.client), snapshot.projects[0], KORA_KITCHEN, ['Quote for Client X: ₦250,000']);
    expect(q.body).toContain('Here is your quote, Amara Osei.');
    expect(q.body).toMatch(/Price: NGN\s?300,000|Price: ₦300,000/);
    expect(p.asked[0].prompt).toContain('pages: Home, Menu');
    const c = checklistDraft(snapshot.projects[0], KORA_KITCHEN);
    expect(c).toMatchObject({ kind: 'checklist', channel: null });
    expect(c.body).toContain('Keys and accounts:');
  });

  it('opens WhatsApp with the message, or Instagram, and never sends anything itself', () => {
    expect(approveHref({ channel: 'whatsapp', recipient: '+234 803 000 0000', body: 'Hi there', finalBody: 'Hi Amara!' })).toBe('https://wa.me/2348030000000?text=Hi%20Amara!');
    expect(approveHref({ channel: 'instagram', recipient: '@maisonlune', body: 'x', finalBody: null })).toBe('https://ig.me/m/maisonlune');
    expect(recipientOf(snapshot.projects[2])).toEqual({ channel: null, recipient: '' });
  });
});

describe('Sono AI on Telegram', () => {
  function setup(reply: unknown = { reply: 'You have 3 projects.', sources: [1] }) {
    const p = provider(() => reply);
    const writes: TgOp[] = [];
    let editing: string | null = null;
    const drafts = new Map<string, Record<string, unknown>>();
    const state = (): TgState => ({
      providers: [], rules: [], history: [], editingDraft: editing, voice: [], pendingFollowUps: [], followUpDays: 3, projects: snapshot.projects, scorecards: [], redactions: [],
    });
    const backend: TgBackend = {
      state: async () => state(),
      async write<T>(w: TgOp) {
        writes.push(w);
        if (w.op === 'message') return { id: '00000000-0000-4000-8000-0000000000a1' } as T;
        if (w.op === 'rule') return { id: '00000000-0000-4000-8000-0000000000b1' } as T;
        if (w.op === 'confirm_rule') return { id: w.args.id, text: 'x' } as T;
        if (w.op === 'draft') {
          const d = drafts.get(w.args.id)!;
          if (w.args.decision === 'editing') editing = w.args.id;
          if (w.args.decision === 'approved' && d.status === 'pending') Object.assign(d, { status: 'approved', final_body: w.args.body ?? null }), (editing = null);
          return d as T;
        }
        return { ok: true } as T;
      },
      match: async () => [],
    };
    const sent: { text: string; buttons?: unknown }[] = [];
    const answers: string[] = [];
    const bot: Telegram = { send: async (_c, text, buttons) => void sent.push({ text, buttons }), answerCallback: async (_i, t) => void answers.push(t), setWebhook: async () => {}, username: async () => 'b' };
    return { p, writes, backend, bot, sent, answers, drafts };
  }

  it('says when no provider can answer, and confirms rules with a button', async () => {
    const s = setup();
    await ownerMessage(42, 'how many projects do I have?', s.bot, s.backend);
    expect(s.sent[0].text).toMatch(/saving its remaining quota for site builds/);

    await ownerMessage(42, 'Always reply in English', s.bot, s.backend);
    expect(s.sent[1].text).toContain('I’ll remember this: “Always reply in English”');
    expect(s.sent[1].buttons).toEqual([[{ text: '💾 Save rule', data: 'rule:00000000-0000-4000-8000-0000000000b1' }]]);
    expect(await assistButton(42, 'q', 'rule:00000000-0000-4000-8000-0000000000b1', s.bot, s.backend)).toBe(true);
    expect(s.answers[0]).toBe('Saved to your rulebook.');
    expect(await assistButton(42, 'q', 'something:else', s.bot, s.backend)).toBe(false);
  });

  it('lets you edit a draft by replying with the new text, then gives you the WhatsApp link', async () => {
    const s = setup();
    const id = '00000000-0000-4000-8000-0000000000d1';
    s.drafts.set(id, { id, project_id: 'p1', kind: 'follow_up', channel: 'whatsapp', recipient: '+234 803 000 0000', title: 'Follow up with Kora Kitchen', why: '', body: 'Hi', final_body: null, status: 'pending', created_at: NOW, decided_at: null });
    await assistButton(42, 'q1', `d:e:${id}`, s.bot, s.backend);
    expect(s.sent.at(-1)!.text).toContain('Send me the new text');
    await ownerMessage(42, 'Hi Amara, any thoughts on the site?', s.bot, s.backend);
    expect(s.sent.at(-1)!.text).toContain('https://wa.me/2348030000000?text=Hi%20Amara%2C%20any%20thoughts%20on%20the%20site%3F');
    // Your edit is kept as an example of how you write.
    expect(s.writes.find((w) => w.op === 'draft' && w.args.decision === 'approved')).toMatchObject({ args: { body: 'Hi Amara, any thoughts on the site?' } });
  });
});
