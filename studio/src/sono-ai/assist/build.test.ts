import { describe, expect, it } from 'vitest';
import type { ChatRequest, ProviderClient } from '@/ai/types';
import { briefSchema } from '@/generate/brief';
import type { Telegram } from '../telegram';
import { BRIEF_INTRO, briefAgain, briefSummary, buildAsk, buildFollowUp, existingProject, extractBuild, MISSING_NAME, MISSING_NAME_AGAIN, PLACEHOLDER_NAME, presetFor, toBrief } from './build';
import { draftAsk, ruleIn } from './modes';
import { answer } from './engine';
import type { TgBackend, TgOp } from './telegram-assist';
import { NEW_CHAT, ownerMessage } from './telegram-chat';

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
    // Other ways of asking.
    expect(buildAsk('I want you to build a website for Kick Lab, a streetwear shop')).toBe(true);
    expect(buildAsk('I need a website for Crumbs, a bakery in Yaba')).toBe(true);
    expect(buildAsk('new site for Crumbs, a bakery')).toBe(true);
    expect(buildAsk('help me make a landing page for a salon called Nala')).toBe(true);
    expect(buildAsk('ok sono, can you please create a website for my client Ada’s restaurant')).toBe(true);
    expect(buildAsk('Let’s design a site for Volt Supply')).toBe(true);
    // Questions about past work stay questions.
    expect(buildAsk('which sites did I make last week?')).toBe(false);
    expect(buildAsk('did I build a site for Crumbs?')).toBe(false);
    expect(buildAsk('what makes a good landing page?')).toBe(false);
  });

  it('understands a follow-up that makes it a build request', () => {
    const history = [
      { role: 'user' as const, text: 'Make the Kora Kitchen one for the restaurant on Admiralty Way' },
      { role: 'assistant' as const, text: 'Got it, I’ll get those pages up right now' },
      { role: 'user' as const, text: 'I meant the website' },
    ];
    expect(buildFollowUp('I meant the website', history)).toBe(true);
    expect(buildFollowUp('yes, build it', history)).toBe(true);
    // Without an earlier request, it's just chat.
    expect(buildFollowUp('I meant the website', [{ role: 'user', text: 'what do you think of my portfolio?' }])).toBe(false);
    expect(buildFollowUp('which website?', history)).toBe(false);
    expect(buildFollowUp('thanks', history)).toBe(false);
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

  it('starts with placeholders when told to, instead of asking for the name again', async () => {
    const noName = { ...mamas, businessName: '', businessType: 'restaurant', facts: '' };
    const history = [
      { role: 'user' as const, text: 'Build a pitch site for a restaurant' },
      { role: 'assistant' as const, text: MISSING_NAME },
    ];
    const asked = await extractBuild('Build a pitch site for a restaurant', [], { providers: [provider(noName).client], hooks: {} });
    expect(asked).toEqual({ missing: MISSING_NAME });
    const b = await extractBuild('Use placeholders and just get the site started we’ll be editing it later', history, { providers: [provider(noName).client], hooks: {} });
    expect(b).toMatchObject({ businessName: PLACEHOLDER_NAME, businessType: 'Restaurant', facts: expect.stringContaining('Placeholder details') });
    // Any answer to the name question carries on the request.
    expect(buildFollowUp('Use placeholders', history)).toBe(true);
    expect(buildFollowUp('Crumbs, a bakery in Yaba', history)).toBe(true);
    expect(buildFollowUp('wait, what pages do you usually make?', history)).toBe(false);
  });

  it('doesn’t mistake everyday messages for rules, drafts or builds', () => {
    expect(ruleIn('Never mind')).toBeNull();
    expect(ruleIn('never mind, ignore that')).toBeNull();
    expect(ruleIn('Remember the Kora site?')).toBeNull();
    expect(ruleIn('Always happy to see a new client')).toBeNull();
    expect(ruleIn('Never use stock photos of food')).toBe('Never use stock photos of food');
    expect(ruleIn('Remember that Ada prefers WhatsApp')).toBe('Ada prefers WhatsApp');
    expect(buildAsk('do you think the site looks good')).toBe(false);
    expect(buildAsk('make sure the site loads fast')).toBe(false);
    expect(buildAsk('Make a website for Lagos Quotes, a printing shop')).toBe(true);
    expect(draftAsk('Make a website for Lagos Quotes, a printing shop')).toBeNull();
    expect(draftAsk('write a quote for Crumbs')).toEqual({ kind: 'quote' });
  });

  it('keeps everyday sentences out of rules, drafts and builds', () => {
    // Not rules: past events and remarks.
    expect(ruleIn('Never got a reply from Crumbs. Draft a follow-up for them')).toBeNull();
    expect(ruleIn('Never received the payment from Kora, what do I do')).toBeNull();
    expect(ruleIn('Remember that site I built for Kora last week')).toBeNull();
    expect(ruleIn('Always the same wahala with this client')).toBeNull();
    // Not drafts: questions about drafting and other uses of the words.
    expect(draftAsk('How do I write a good follow-up?')).toBeNull();
    expect(draftAsk('The client said my quote was too high, what do I make of that')).toBeNull();
    expect(draftAsk('Never got a reply from Crumbs. Draft a follow-up for them')).toEqual({ kind: 'follow_up' });
    // Not builds: things made for a site, and work on a pitch.
    for (const m of ['Do a summary of my pitches this month', 'Make my pitch to Kora shorter', 'Design tips for a bakery website', 'Create an Instagram caption for my new website', 'Make a logo for my website'])
      expect(buildAsk(m), m).toBe(false);
    expect(buildAsk('Build me a website for Crumbs, a bakery in Yaba')).toBe(true);
    expect(buildAsk('can you start a site for Mama Put')).toBe(true);
  });

  it('lets you drop a build when asked for the name, and offers placeholders the second time', async () => {
    const history = [
      { role: 'user' as const, text: 'build a site' },
      { role: 'assistant' as const, text: MISSING_NAME },
    ];
    for (const m of ['never mind', 'forget it, show me my pitches', 'No', 'show me my drafts', 'Tell me about the weather']) expect(buildFollowUp(m, history), m).toBe(false);
    expect(buildFollowUp('Crumbs, a bakery in Yaba', history)).toBe(true);
    const again = await extractBuild('the one in Yaba', history, { providers: [provider({ businessName: '', businessType: 'Bakery', pages: [], facts: '', client: {} }).client], hooks: {} });
    expect(again).toEqual({ missing: MISSING_NAME_AGAIN });
    expect(buildFollowUp('Crumbs', [...history, { role: 'user', text: 'the one in Yaba' }, { role: 'assistant', text: MISSING_NAME_AGAIN }])).toBe(true);
  });

  it('points to Plan it instead of filing the same build twice', () => {
    const history = [
      { role: 'user' as const, text: 'Build a site for Crumbs, a bakery' },
      { role: 'assistant' as const, text: `${BRIEF_INTRO}\n\nCrumbs, a bakery.` },
    ];
    expect(briefAgain('yes go ahead', history)).toBe(true);
    expect(briefAgain('looks good, plan it', history)).toBe(true);
    expect(buildFollowUp('yes, build it', history)).toBe(false);
    expect(briefAgain('what pages will it have?', history)).toBe(false);
    expect(briefAgain('Yes but change the name to Crumbs & Co', history)).toBe(false);
    expect(briefAgain('ok now do one for Mama Put, a restaurant in Lekki', history)).toBe(false);
    expect(briefAgain('yes', [{ role: 'assistant', text: 'Anything else?' }])).toBe(false);
  });

  it('notices a project with the same name already exists', () => {
    const projects = [{ id: 'p1', name: 'Crumbs' }];
    const brief = { ...mamas, businessName: 'crumbs', businessType: 'Bakery', pages: ['home' as const], client: { ...mamas.client, address: '' } };
    expect(existingProject(brief, projects, 'Build a site for Crumbs')).toEqual({ id: 'p1', name: 'Crumbs' });
    expect(existingProject(brief, projects, 'Build another site for Crumbs')).toBeNull();
    expect(existingProject({ ...brief, businessName: PLACEHOLDER_NAME }, [{ id: 'p2', name: PLACEHOLDER_NAME }], 'use placeholders')).toBeNull();
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

  it('starts over on Telegram with /new', async () => {
    const writes: TgOp[] = [];
    const seen: string[][] = [];
    const backend: TgBackend = {
      state: async () => ({ providers: [], rules: [], history: [{ role: 'user', text: 'old' }, { role: 'assistant', text: NEW_CHAT }, { role: 'user', text: 'kept' }], editingDraft: null, voice: [], pendingFollowUps: [], followUpDays: 3, projects: [], scorecards: [], redactions: [] }),
      write: async <T,>(w: TgOp) => (writes.push(w), { id: '00000000-0000-4000-8000-000000000002' } as T),
      match: async () => [],
    };
    const sent: string[] = [];
    const bot: Telegram = { send: async (_c, text) => void sent.push(text), answerCallback: async () => {}, setWebhook: async () => {}, username: async () => 'b' };
    await ownerMessage(42, '/new', bot, backend);
    expect(writes).toEqual([{ op: 'message', args: { role: 'assistant', text: NEW_CHAT, mode: null } }]);
    expect(sent[0]).toMatch(/New conversation/);
    // Only what came after the marker is remembered: a follow-up to "old" isn't one any more.
    const state = (await backend.state())!;
    seen.push(state.history.slice(state.history.map((h) => h.text).lastIndexOf(NEW_CHAT) + 1).map((h) => h.text));
    expect(seen[0]).toEqual(['kept']);
  });
});
