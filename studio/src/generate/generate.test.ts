import { describe, expect, it } from 'vitest';
import { demoClient } from '@/ai/demo';
import { geminiClient, openAiCompatClient } from '@/ai/providers';
import { AllProvidersFailed, extractJson, runJson } from '@/ai/router';
import { ProviderError, type ProviderClient } from '@/ai/types';
import { siteConfigSchema } from '@/site/schema';
import { z } from 'zod';
import { brandOverrides } from './assemble';
import { EMPTY_EXTRACTED, type Brief, type GenerationJob } from './brief';
import { applyKnownFacts } from './fill';
import { placeImages } from './images';
import { advance, nextUnit, stepsFor } from './pipeline';
import { normalisePlan } from './plan';

const brief: Brief = {
  businessName: 'Kora Kitchen',
  businessType: 'Restaurant',
  preset: 'warm-table',
  pages: ['home', 'menu', 'contact'],
  paste: 'Family recipes since 2014\nJollof rice $16\nSuya $18\nTue to Sat 17:00 to 22:00',
  client: { ownerName: 'Amara', whatsapp: '+1 555 214 0090', instagram: '@korakitchen', address: '14 Mill Lane' },
  brandColors: [],
  useBrand: false,
};

function fake(id: ProviderClient['id'], replies: (string | Error)[]): ProviderClient & { calls: number } {
  const c = {
    id,
    models: { strong: `${id}-big`, light: `${id}-small` },
    calls: 0,
    async chat() {
      const r = replies[Math.min(c.calls++, replies.length - 1)];
      if (r instanceof Error) throw r;
      return { text: r, model: `${id}-model` };
    },
  };
  return c;
}

const schema = z.object({ ok: z.literal(true) });
const req = { task: 'parse' as const, system: 's', prompt: 'p' };

describe('router', () => {
  it('extracts JSON from fenced or chatty replies', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":[1,2]} hope that helps')).toEqual({ a: [1, 2] });
    expect(() => extractJson('nothing here')).toThrow();
  });

  it('repairs an invalid reply once on the same provider', async () => {
    const a = fake('gemini', ['{"ok":false}', '{"ok":true}']);
    const r = await runJson([a], req, schema);
    expect(r.provider).toBe('gemini');
    expect(a.calls).toBe(2);
    expect(r.attempts.map((x) => x.outcome)).toEqual(['invalid', 'ok']);
  });

  it('falls back on rate limits and cools the limited provider down', async () => {
    const cooled: string[] = [];
    let used = 0;
    const a = fake('gemini', [new ProviderError('slow down', 'rate_limit', 30_000)]);
    const b = fake('groq', ['{"ok":true}']);
    const r = await runJson([a, b], req, schema, { onCooldown: (p) => void cooled.push(p), onRequest: () => void used++, now: () => 1000 });
    expect(r.provider).toBe('groq');
    expect(cooled).toEqual(['gemini']);
    expect(used).toBe(2);
  });

  it('moves on after two invalid replies and reports every attempt when all fail', async () => {
    const a = fake('gemini', ['{"ok":false}']);
    const b = fake('groq', [new ProviderError('bad key', 'auth')]);
    await expect(runJson([a, b], req, schema)).rejects.toBeInstanceOf(AllProvidersFailed);
    expect(a.calls).toBe(2);
    await expect(runJson([], req, schema)).rejects.toThrow(/No AI provider is set up/);
  });
});

describe('provider adapters', () => {
  it('speaks the Gemini generateContent format', async () => {
    let seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });
    }) as typeof fetch;
    const r = await geminiClient('KEY', { strong: 'g-pro', light: 'g-lite' }, f).chat({ ...req, system: 'sys' }, 'g-lite');
    expect(r.text).toBe('{"ok":true}');
    expect(seen!.url).toContain('/models/g-lite:generateContent');
    expect(seen!.headers['x-goog-api-key']).toBe('KEY');
    expect((seen!.body.generationConfig as Record<string, unknown>).responseMimeType).toBe('application/json');
  });

  it('maps HTTP 429 to a rate limit with Retry-After', async () => {
    const f = (async () => new Response('quota', { status: 429, headers: { 'retry-after': '12' } })) as unknown as typeof fetch;
    const err = await openAiCompatClient('groq', 'K', { strong: 'm', light: 'm' }, f).chat(req, 'm').catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('rate_limit');
    expect(err.retryAfterMs).toBe(12_000);
  });

  it('retries without JSON mode when a model rejects it', async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      if (body.response_format) return new Response('response_format is not supported', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    }) as typeof fetch;
    const r = await openAiCompatClient('openrouter', 'K', { strong: 'm', light: 'm' }, f).chat(req, 'm');
    expect(r.text).toBe('{"ok":true}');
    expect(bodies.length).toBe(2);
  });
});

describe('plan normalisation', () => {
  it('keeps requested pages in order, drops fixed sections and fixes variants', () => {
    const plan = normalisePlan(
      {
        pages: [
          { path: '/contact', title: 'Contact', sections: [{ type: 'contact', variant: 'nope', note: 'x' }] },
          { path: '/', title: 'Home', sections: [{ type: 'navbar', variant: 'inline', note: '' }, { type: 'hero', variant: 'centered', note: 'h' }, { type: 'stats', variant: 'row', note: 's' }] },
        ],
      },
      brief,
      EMPTY_EXTRACTED,
    );
    expect(plan.pages.map((p) => p.path)).toEqual(['/', '/menu', '/contact']);
    expect(plan.pages[0].sections.map((s) => s.type)).toEqual(['hero']); // navbar removed, stats dropped without facts
    expect(plan.pages[1].sections.length).toBeGreaterThan(0); // menu was missing: defaults
    expect(plan.pages[2].sections[0].variant).toBe('map-and-hours');
  });
});

describe('guard rails', () => {
  it('turns any testimonial into a labelled sample and never keeps model image URLs', () => {
    const s = applyKnownFacts(
      { id: 't', type: 'testimonials', variant: 'quotes', content: { heading: 'h', items: [{ quote: 'q', name: 'Real Person', detail: 'Google' }], rating: 5 } },
      brief,
      null,
    );
    expect(s.type === 'testimonials' && s.content.items[0]).toMatchObject({ name: 'Customer name', detail: 'Sample review' });
    expect(s.type === 'testimonials' && s.content.rating).toBeUndefined();
    const h = applyKnownFacts(
      { id: 'h', type: 'hero', variant: 'centered', content: { eyebrow: '', heading: 'x', subheading: '', image: { src: 'https://made.up/x.jpg', alt: 'a' } } },
      brief,
      null,
    );
    expect(h.type === 'hero' && h.content.image.src).toBe('');
  });

  it('only uses logo colours that stay readable as the primary', () => {
    expect(brandOverrides({ ...brief, useBrand: true, brandColors: ['#F6EEDF', '#3E4A2A'] })).toEqual({ primary: '#3E4A2A', accent: '#F6EEDF' });
    expect(brandOverrides({ ...brief, useBrand: false, brandColors: ['#3E4A2A'] })).toEqual({});
  });

  it('places client photos before stock and caps stock requests', async () => {
    let searches = 0;
    const stock = { search: async (q: string) => (searches++, { source: 'unsplash' as const, url: `https://img/${searches}`, alt: q, credit: 'Photo by A on Unsplash', width: 1, height: 1 }) };
    const pages = {
      home: [
        { id: 'h', type: 'hero', variant: 'split-photo', content: { eyebrow: '', heading: 'x', subheading: '', image: { src: '', alt: 'dish' } } },
        { id: 'g', type: 'gallery', variant: 'masonry', content: { heading: '', intro: '', images: [1, 2, 3, 4].map((n) => ({ src: '', alt: `g${n}` })) } },
      ],
    } as never;
    const own = [{ id: 'a', projectId: 'p', kind: 'photo' as const, source: 'upload' as const, url: '/mine.jpg', alt: 'mine', credit: '', width: null, height: null, createdAt: '' }];
    const r = await placeImages(pages, ['home'], own, stock, 'restaurant', 2);
    const hero = r.pages.home[0];
    expect(hero.type === 'hero' && hero.content.image.src).toBe('/mine.jpg');
    expect(r.stock.length).toBe(2);
    expect(searches).toBe(2);
  });
});

describe('pipeline with the demo provider', () => {
  it('runs from brief to a valid saved site, pausing for plan review', async () => {
    let saved: unknown = null;
    let job: GenerationJob = {
      id: 'j', projectId: 'p', status: 'running', brief, extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null, createdAt: '', updatedAt: '',
    };
    const deps = { providers: [demoClient()], stock: null, assets: [], saveVersion: async (c: unknown) => ((saved = c), 1), recordStock: async () => {} };
    job = (await advance(job, deps)).job;
    expect(job.extracted?.items.map((i) => i.price)).toEqual(['$16', '$18']);
    job = (await advance(job, deps)).job;
    expect(job.status).toBe('plan_review');
    expect(nextUnit(job)).toBeNull();
    job = { ...job, status: 'running' };
    let version: number | undefined;
    for (let i = 0; i < 10 && job.status === 'running'; i++) ({ job, version } = await advance(job, deps));
    expect(job.status).toBe('done');
    expect(version).toBe(1);
    expect(siteConfigSchema.safeParse(saved).success).toBe(true);
    expect(stepsFor(job).every((s) => s.state === 'done' || s.state === 'skipped')).toBe(true);
  }, 20_000);

  it('fails with a clear message when no provider is set up, and resumes on retry', async () => {
    const job: GenerationJob = {
      id: 'j', projectId: 'p', status: 'running', brief, extracted: { ...EMPTY_EXTRACTED }, plan: null, filled: {}, imagesDone: false, steps: [], error: null, createdAt: '', updatedAt: '',
    };
    const deps = { providers: [], stock: null, assets: [], saveVersion: async () => 1, recordStock: async () => {} };
    const failed = (await advance(job, deps)).job;
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/Settings/);
    const retried = (await advance({ ...failed, status: 'running' }, { ...deps, providers: [demoClient()] })).job;
    expect(retried.status).toBe('plan_review');
  });
});

import { paletteFromPixels } from './palette';

describe('logo palette', () => {
  it('finds the main colours and ignores white and transparent pixels', () => {
    const px = (r: number, g: number, b: number, a = 255, n = 1) => Array.from({ length: n }, () => [r, g, b, a]).flat();
    const data = [
      ...px(255, 255, 255, 255, 500), // background
      ...px(0, 0, 0, 0, 300), // transparent
      ...px(22, 20, 15, 255, 200), // ink
      ...px(24, 21, 16, 255, 50), // near-identical ink
      ...px(180, 80, 46, 255, 120), // terracotta
      ...px(10, 200, 10, 255, 1), // stray pixel
    ];
    expect(paletteFromPixels(data)).toEqual(['#16140F', '#B4502E']);
  });
});

import { pickModels } from '@/ai/models';
import { describeAttempts } from '@/ai/router';

describe('model picking', () => {
  const gemini = ['gemini-2.0-flash', 'gemini-3.0-flash', 'gemini-3.0-flash-lite', 'gemini-3.0-pro', 'gemini-3.0-flash-image', 'gemini-3.1-flash-preview', 'text-embedding-004'];
  it('picks the newest stable Flash and Flash-Lite when saved names are gone', () => {
    expect(pickModels('gemini', gemini, { strong: 'gemini-2.5-flash', light: 'gemini-2.5-flash-lite' })).toEqual({ strong: 'gemini-3.0-flash', light: 'gemini-3.0-flash-lite' });
  });
  it('keeps saved models that still exist', () => {
    expect(pickModels('gemini', gemini, { strong: 'gemini-3.0-pro', light: 'gemini-2.0-flash' })).toEqual({ strong: 'gemini-3.0-pro', light: 'gemini-2.0-flash' });
  });
  it('handles Groq and OpenRouter lists', () => {
    expect(pickModels('groq', ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'whisper-large-v3'])).toEqual({ strong: 'llama-3.3-70b-versatile', light: 'llama-3.1-8b-instant' });
    expect(pickModels('openrouter', ['a/small:free', 'meta-llama/llama-3.3-70b-instruct:free']).strong).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });
  it('explains failures in plain words', () => {
    const text = describeAttempts([{ provider: 'gemini', model: 'gemini-2.5-flash', outcome: 'bad_request', detail: 'Gemini: model not found. Pick an available model' }]);
    expect(text).toMatch(/^Gemini \(gemini-2.5-flash\) refused the request: Gemini: model not found/);
  });
});

import { retiredModels } from '@/ai/service';

describe('retired model detection', () => {
  it('reads retired names from the failure message', () => {
    const msg = 'Every AI provider failed. Gemini (gemini-2.5-flash) refused the request: Gemini: model not found. Pick an available model in Settings → AI providers → Manage. ({ "error": { "code": 404, "message": "This model models/gemini-2.5-flash is no longer available to new users. }).';
    expect(retiredModels(msg)).toEqual(['gemini-2.5-flash']);
  });
});

import deClassic from './fixtures/de-classic-site-data.json';
import { buildConfig as assembleSite, fixLinks } from './assemble';
import { thin } from './fill';
import type { Section as SiteSection, SiteConfig as Site } from '@/site/schema';

/** The first real generation (Gemini, hotel, name and type only), exported from production. */
describe('regressions from the De Classic run', () => {
  const realBrief = deClassic.generation.brief as Brief;
  const realPlan = deClassic.generation.plan as unknown as Parameters<typeof assembleSite>[2];
  const filled: Record<string, SiteSection[]> = Object.fromEntries(
    (deClassic.config as unknown as Site).pages.map((p) => [p.id, p.sections.filter((s) => !['navbar', 'footer', 'whatsapp-float'].includes(s.type))]),
  );

  it('treats a name-and-type-only brief as thin', () => {
    expect(thin(realBrief, EMPTY_EXTRACTED)).toBe(true);
  });

  it('never keeps a model-written address, hours or email', () => {
    const contact = filled.contact.find((s) => s.type === 'contact')!;
    const fixed = applyKnownFacts(contact, realBrief, EMPTY_EXTRACTED);
    expect(fixed.type === 'contact' && [fixed.content.address, fixed.content.hours, fixed.content.email]).toEqual(['', [], '']);
  });

  it('swaps a price list for cards when there are no prices', () => {
    const plan = normalisePlan({ pages: [{ path: '/rooms', title: 'Rooms', sections: [{ type: 'features', variant: 'price-list', note: 'rooms' }] }] }, { ...realBrief, pages: ['rooms'] }, EMPTY_EXTRACTED);
    expect(plan.pages.find((p) => p.id === 'rooms')!.sections[0].variant).toBe('cards');
  });

  it('uses the hero line as tagline and keeps every internal link pointing somewhere real', () => {
    const site = assembleSite(realBrief, EMPTY_EXTRACTED, realPlan, filled, []);
    const footer = site.pages[0].sections.find((s) => s.type === 'footer')!;
    expect(footer.type === 'footer' && footer.content.tagline).toMatch(/understated luxury/);
    const ids = new Map(site.pages.map((p) => [p.path, new Set(p.sections.map((s) => s.id))]));
    const hrefs: [string, string][] = [];
    const walk = (v: unknown, path: string): void => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, path));
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.href === 'string') hrefs.push([o.href, path]);
        Object.values(o).forEach((x) => walk(x, path));
      }
    };
    site.pages.forEach((p) => walk(p.sections, p.path));
    for (const [href, path] of hrefs) {
      const m = /^(\/[a-z0-9-]*)?#([a-z0-9-]*)$/.exec(href);
      if (m) expect(ids.get(m[1] || path)?.has(m[2]), href).toBe(true);
      else if (href.startsWith('/')) expect(ids.has(href), href).toBe(true);
    }
    expect(fixLinks({ ...site, pages: [{ ...site.pages[0], sections: [{ id: 'x', type: 'cta', variant: 'boxed', content: { heading: 'h', text: '', button: { label: 'Go', href: '/#nope' } } }] }] }).pages[0].sections[0]).toMatchObject({ content: { button: { href: '/' } } });
  });
});
