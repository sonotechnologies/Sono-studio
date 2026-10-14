import { describe, expect, it } from 'vitest';
import type { ChatRequest, ProviderClient } from '@/ai/types';
import { briefSchema } from '@/generate/brief';
import type { Telegram } from '../telegram';
import { briefSummary, buildAsk, extractBuild, presetFor, toBrief } from './build';
import { answer } from './engine';
import type { TgBackend, TgOp } from './telegram-assist';
import { ownerMessage } from './telegram-chat';

function provider(reply: unknown) {
  const asked: ChatRequest[] = [];
  const client: ProviderClient = { id: 'groq', models: { strong: 's', light: 'l' }, chat: async (req) => (asked.push(req), { text: JSON.stringify(reply), model: 'l' }) };
  return { client, asked };
}

const mamas = {
  businessName: 'Mama’s Kitchen',
  businessType: 'restaurant',
  pages: ['home', 'menu', 'Contact', 'blog'],
  facts: 'Jollof and grills in Lekki, open 11am to 10pm.',
  client: { ownerName: 'Ada', whatsapp: '0803 111 2222', instagram: '@mamaskitchen' },
};

describe('build requests', () => {
  it('recognises a request to build a site, and nothing else', () => {
    expect(buildAsk('Build a pitch site for Mama’s Kitchen, a restaurant in Lekki')).toBe(true);
    expect(buildAsk('can you make a website for my friend’s salon?')).toBe(true); // a polite request is still a request
    expect(buildAsk('could you create a landing page for Crumbs bakery')).toBe(true);
    expect(buildAsk('how many sites did I build this month?')).toBe(false);
    expect(buildAsk('draft follow-ups')).toBe(false);
  });

  it('reads the brief from the request without inventing anything', async () => {
    const p = provider(mamas);
    const b = await extractBuild('Build a site for Mama’s Kitchen…', [{ role: 'user', text: 'their WhatsApp is 0803 111 2222' }], { providers: [p.client], hooks: {} });
    expect(b).toEqual({
      businessName: 'Mama’s Kitchen',
      businessType: 'Restaurant', // matched to the studio's kinds
      pages: ['home', 'menu', 'contact'], // unknown pages dropped
      facts: 'Jollof and grills in Lekki, open 11am to 10pm.',
      client: { ownerName: 'Ada', whatsapp: '0803 111 2222', instagram: '@mamaskitchen', address: '' },
    });
    expect(p.asked[0].prompt).toContain('their WhatsApp is 0803 111 2222');
    expect(p.asked[0].system).toContain('never invent');
    expect(await extractBuild('build a site', [], { providers: [provider({ ...mamas, businessName: '' }).client], hooks: {} })).toMatchObject({ missing: expect.stringContaining('called') });
  });

  it('picks the style from what worked for you, and lets a rule override it', () => {
    const past = [
      { businessType: 'Restaurant', preset: 'bold-street', status: 'live' },
      { businessType: 'Restaurant', preset: 'bold-street', status: 'client_approved' },
      { businessType: 'Restaurant', preset: 'luxe-minimal', status: 'live' },
      { businessType: 'Restaurant', preset: 'tech-dark', status: 'draft' }, // not approved: doesn't count
    ];
    expect(presetFor('Restaurant', past, [])).toEqual({ preset: 'bold-street', reason: '2 of your approved restaurant sites used it' });
    expect(presetFor('Restaurant', [], []).preset).toBe('warm-table');
    expect(presetFor('Restaurant', past, ['Always use Soft Studio for restaurants']).preset).toBe('soft-studio');
    expect(presetFor('Restaurant', past, ['Use Tech Dark for gadget stores']).preset).toBe('bold-street'); // a rule for another kind
  });

  it('turns it into the wizard’s brief, with your rules in the notes the pipeline reads', () => {
    const brief = toBrief({ ...mamas, businessType: 'Restaurant', pages: ['home', 'menu'], client: { ...mamas.client, address: '' } }, 'warm-table', ['Keep copy short']);
    expect(briefSchema.safeParse(brief).success).toBe(true);
    expect(brief.paste).toContain('Studio notes (always follow these):\n- Keep copy short');
    expect(briefSummary({ ...mamas, businessType: 'Restaurant', pages: ['home', 'menu'], client: { ...mamas.client, address: '' } })).toContain('Mama’s Kitchen, a restaurant. Pages: Home, Menu.');
  });

  it('never builds from the chat: it only answers with a build request', async () => {
    const p = provider({ reply: 'x' });
    const deps = {
      studioUrl: 'https://s', providers: [p.client], hooks: {}, snapshot: async () => ({ now: '', followUpDays: 3, projects: [] }), rules: async () => [], history: async () => [],
      scorecards: async () => [], embedQuery: null, match: async () => [], redactions: async () => [], web: null,
    };
    expect(await answer('Build a pitch site for Crumbs, a bakery', deps)).toEqual({ kind: 'build' });
    expect(p.asked).toHaveLength(0);
  });

  it('on Telegram, files the request and links to the studio to plan it', async () => {
    const writes: TgOp[] = [];
    const backend: TgBackend = {
      state: async () => ({ providers: [], rules: [], history: [], editingDraft: null, voice: [], pendingFollowUps: [], followUpDays: 3, projects: [], scorecards: [], redactions: [] }),
      write: async <T,>(w: TgOp) => (writes.push(w), (w.op === 'build' ? 'b1' : { id: '00000000-0000-4000-8000-000000000001' }) as T),
      match: async () => [],
    };
    const sent: { text: string; buttons?: unknown }[] = [];
    const bot: Telegram = { send: async (_c, text, buttons) => void sent.push({ text, buttons }), answerCallback: async () => {}, setWebhook: async () => {}, username: async () => 'b' };
    // With no provider free, the brief can't be read: it says so instead of building anything.
    await ownerMessage(42, 'Build a pitch site for Crumbs, a bakery in Yaba', bot, backend);
    expect(writes.some((w) => w.op === 'build')).toBe(false);
    expect(sent[0].text).toMatch(/quota for site builds/);
  });
});
