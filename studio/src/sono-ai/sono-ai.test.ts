import { describe, expect, it } from 'vitest';
import { runJson } from '@/ai/router';
import { ProviderError, type ProviderClient } from '@/ai/types';
import { z } from 'zod';
import type { Project } from '@/lib/types';
import { backfill, outcomesOf, type StudioReader } from './backfill';
import { recorded } from './record';
import { Redactor, type Redaction } from './redact';
import type { Interaction, NewInteraction, Outcome, SonoAiStore } from './store';

const client = { businessName: 'Kora Kitchen', ownerName: 'Amara Osei', whatsapp: '+1 555 214 0090', instagram: '@korakitchen', address: '14 Mill Lane, Old Town' };

function memoryStore(): SonoAiStore & { rows: Interaction[]; outcomes: Outcome[]; redactions: Redaction[] } {
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
    async firstLive() {
      return s.rows.filter((r) => r.source === 'live').map((r) => r.createdAt).sort()[0] ?? null;
    },
    async stats() {
      return { interactions: s.rows.length, live: 0, backfilled: 0, outcomes: s.outcomes.length, redactions: s.redactions.length };
    },
  };
  return s;
}

describe('redaction', () => {
  it('swaps client details for placeholders and leaves prices and years alone', () => {
    const r = new Redactor([], client);
    const text = 'Kora Kitchen (owner Amara, amara@kora.example) on +1 555 214 0090 or 1-555-214-0090, @korakitchen, 14 Mill Lane, Old Town. Since 2014, mains ₦45,000. Ask @someoneelse.';
    const out = r.redact(text);
    expect(out).toBe('Client A (owner Person 1, Email 1) on Phone 1 or Phone 1, Handle 1, Address 1. Since 2014, mains ₦45,000. Ask Handle 2.');
    expect(r.restore(out)).toContain('Kora Kitchen (owner Amara Osei, amara@kora.example)');
  });

  it('keeps placeholders stable across requests from the saved map', () => {
    const first = new Redactor([], client);
    first.redact('write to hello@kora.example');
    const again = new Redactor(first.added, client);
    expect(again.redact('hello@kora.example and new@kora.example')).toBe('Email 1 and Email 2');
    expect(again.added.map((a) => a.value)).toEqual(['new@kora.example']);
  });
});

describe('recording requests', () => {
  const provider = (impl: ProviderClient['chat']): ProviderClient => ({ id: 'groq', models: { strong: 's', light: 'l' }, chat: impl });
  const setup = (store = memoryStore()) => {
    const tasks: Promise<void>[] = [];
    return {
      store,
      tasks,
      wrap: (p: ProviderClient[]) =>
        recorded(p, { store, defer: (t) => void tasks.push(t()), context: async () => ({ projectId: 'p1', siteType: 'showcase', client }) }),
    };
  };

  it('passes requests and answers through unchanged and stores a redacted copy', async () => {
    const { store, tasks, wrap } = setup();
    const seen: string[] = [];
    const reply = '{"heading":"Welcome to Kora Kitchen"}';
    const providers = wrap([provider(async (req) => (seen.push(req.prompt), { text: reply, model: 'l-1', usage: { input: 120, output: 30 } }))]);
    const r = await runJson(providers, { task: 'fill', system: 'You write copy.', prompt: 'Write a heading for Kora Kitchen, owner Amara Osei.' }, z.object({ heading: z.string() }));
    await Promise.all(tasks);
    expect(r.data.heading).toBe('Welcome to Kora Kitchen'); // the studio sees the real answer
    expect(seen[0]).toBe('Write a heading for Kora Kitchen, owner Amara Osei.'); // the provider sees the real request
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ task: 'fill', projectId: 'p1', provider: 'groq', model: 'l-1', status: 'ok', inputTokens: 120, outputTokens: 30, source: 'live' });
    expect(store.rows[0].request).toBe('Write a heading for Client A, owner Person 1.');
    expect(store.rows[0].answer).toBe('{"heading":"Welcome to Client A"}');
    expect(store.redactions.map((x) => x.placeholder)).toContain('Client A');
  });

  it('records failures and limits, and a broken bank never breaks a request', async () => {
    const { store, tasks, wrap } = setup();
    const limited = provider(async () => {
      throw new ProviderError('Groq 429: slow down', 'rate_limit');
    });
    const ok = { ...provider(async () => ({ text: '{"a":1}', model: 'g' })), id: 'gemini' as const };
    await runJson(wrap([limited, ok]), { task: 'plan', system: '', prompt: 'x' }, z.object({ a: z.number() }), { sleep: async () => {} });
    await Promise.all(tasks);
    expect(store.rows.map((r) => [r.provider, r.status])).toEqual([
      ['groq', 'limit'],
      ['groq', 'limit'],
      ['gemini', 'ok'],
    ]);

    const broken = { ...memoryStore(), addInteractions: async () => Promise.reject(new Error('database down')) };
    const b = setup(broken);
    const r = await runJson(b.wrap([ok]), { task: 'plan', system: '', prompt: 'x' }, z.object({ a: z.number() }));
    await Promise.all(b.tasks);
    expect(r.data.a).toBe(1);
  });
});

describe('importing history', () => {
  const project = {
    id: 'p1', name: 'Kora Kitchen', businessType: 'Restaurant', siteType: 'showcase', status: 'live', currentVersion: 5, liveUrl: 'https://kora.example', liveAt: '2026-10-05T10:00:00Z',
    updatedAt: '2026-10-05T10:00:00Z', client: { ownerName: 'Amara Osei', whatsapp: '+1 555 214 0090', instagram: '@korakitchen', address: '', notes: '' },
  } as unknown as Project;
  const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 9, min)).toISOString();
  const studio: StudioReader = {
    listProjects: async () => [project],
    getLatestJob: async () => ({
      id: 'j1', projectId: 'p1', status: 'done', brief: { businessName: 'Kora Kitchen' } as never, extracted: null,
      plan: { pages: [{ id: 'home', path: '/', title: 'Home', sections: [] }] } as never, filled: { home: [] }, imagesDone: true, error: null, createdAt: t(0), updatedAt: t(2),
      steps: [
        { key: 'plan', label: 'Planning', status: 'done', provider: 'gemini', model: 'flash', ms: 4000, at: t(0) },
        { key: 'write:home', label: 'Writing', status: 'done', provider: 'groq', model: 'llama', ms: 2000, at: t(1) },
        { key: 'photos', label: 'Photos', status: 'done', provider: 'local', ms: 10, at: t(1) },
      ],
    }),
    listChatMessages: async () => [
      { id: 'c1', role: 'user', text: 'Call it Kora Kitchen & Bar', scope: 'site', change: '', version: null, createdAt: t(10) },
      { id: 'c2', role: 'assistant', text: 'Renamed it.', scope: 'site', change: 'Renamed', version: 3, createdAt: t(10) },
      { id: 'c3', role: 'user', text: 'Make the hero dark', scope: 'section', change: '', version: null, createdAt: t(20) },
      { id: 'c4', role: 'assistant', text: 'Done.', scope: 'section', change: 'Hero dark', version: 4, createdAt: t(20) },
    ],
    listSiteVersions: async () => [
      { version: 1, summary: 'Generated site', createdAt: t(2) },
      { version: 2, summary: 'Hero heading', createdAt: t(5) },
      { version: 3, summary: 'Chat: Renamed', createdAt: t(10) },
      { version: 4, summary: 'Chat: Hero dark', createdAt: t(20) },
      { version: 5, summary: 'Undid a chat change', createdAt: t(21) },
    ],
    listPitchEvents: async () => [
      { id: 'e2', openedAt: t(40), device: 'mobile', isBot: false, path: '/' },
      { id: 'e1', openedAt: t(30), device: 'desktop', isBot: true, path: '/' },
    ],
  };

  it('imports redacted history once and links what came of it', async () => {
    const store = memoryStore();
    const first = await backfill(studio, store);
    expect(first).toMatchObject({ projects: 1, interactions: 4 });
    expect(store.rows.map((r) => r.task)).toEqual(['plan', 'fill', 'chat', 'chat']);
    expect(JSON.stringify(store.rows)).not.toMatch(/Kora|Amara|555/);
    expect(store.rows[2].request).toBe('Call it Client A & Bar');

    const kinds = (task: string) => store.outcomes.filter((o) => store.rows.find((r) => r.id === o.interactionId)?.task === task).map((o) => o.kind);
    expect(kinds('plan')).toEqual(['kept']);
    expect(kinds('fill').sort()).toEqual(['edited', 'kept']);
    expect(store.outcomes.find((o) => o.kind === 'edited')?.version).toBe(2);
    expect(kinds('chat').sort()).toEqual(['kept', 'undone']);
    expect(store.outcomes.find((o) => o.kind === 'undone')?.interactionId).toBe(store.rows[3].id); // the hero change was undone
    expect(store.outcomes.filter((o) => !o.interactionId).map((o) => [o.kind, o.happenedAt])).toEqual([
      ['pitch_opened', t(40)], // the bot's earlier open doesn't count
      ['approved', project.updatedAt],
      ['live', project.liveAt],
    ]);

    await backfill(studio, store);
    expect(store.rows).toHaveLength(4);

    // Once live recording has started, later history is already in the bank and isn't imported twice.
    const fresh = memoryStore();
    await fresh.addInteractions([{ ...store.rows[0], source: 'live', sourceRef: null, createdAt: t(15) }]);
    await backfill(studio, fresh);
    expect(fresh.rows.filter((r) => r.source === 'backfill').map((r) => r.sourceRef)).toEqual(['job:j1:0', 'job:j1:1', 'chat:c2']);
    expect(store.outcomes).toHaveLength(first.outcomes);
  });

  it('marks a run as regenerated when the site was generated again', () => {
    const rows = [{ id: 'a', task: 'plan', status: 'ok', createdAt: t(0) }] as Interaction[];
    const out = outcomesOf(project, [{ version: 1, summary: 'Generated site', createdAt: t(1) }, { version: 2, summary: 'Generated site', createdAt: t(9) }], rows, []);
    expect(out.filter((o) => o.interactionId === 'a').map((o) => [o.kind, o.version])).toEqual([['regenerated', 2]]);
  });
});
