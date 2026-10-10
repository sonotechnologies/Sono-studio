import type { Brief, Extracted, PlanPage } from '@/generate/brief';
import { DEFAULT_PAGE_SECTIONS } from '@/generate/plan';
import { pagesFor } from '@/generate/brief';
import type { ContentOf, SectionType } from '@/site/schema';
import type { ChatRequest, ChatResult, ProviderClient } from './types';

/*
 * Demo provider for local development without API keys. It answers each task
 * from templates, deterministically, so the whole pipeline can be exercised.
 * It is labelled "Demo" everywhere and is never used in production.
 */

export type DemoContext =
  | { kind: 'parse'; brief: Brief }
  | { kind: 'plan'; brief: Brief }
  | { kind: 'fill'; brief: Brief; extracted: Extracted | null; page: PlanPage }
  | { kind: 'chat' };

export function demoAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.SONO_DEMO_AI === '1';
}

const photo = (alt: string) => ({ src: '', alt });

export function demoContent(type: SectionType, brief: Brief, extracted: Extracted | null, pageTitle: string): ContentOf<SectionType> {
  const name = brief.businessName;
  const kind = brief.businessType.toLowerCase();
  const items = extracted?.items ?? [];
  switch (type) {
    case 'hero':
      return {
        eyebrow: pageTitle === 'Home' ? brief.businessType : pageTitle,
        heading: pageTitle === 'Home' ? extracted?.tagline || `Welcome to ${name}` : pageTitle,
        subheading: pageTitle === 'Home' ? `A ${kind} that people come back to.` : `Everything about our ${pageTitle.toLowerCase()}.`,
        primaryCta: { label: 'Get in touch', href: '/contact' },
        image: photo(`${kind} interior, warm light`),
      } satisfies ContentOf<'hero'>;
    case 'about':
      return {
        eyebrow: 'Our story',
        heading: `About ${name}`,
        body: [`${name} is a ${kind}${brief.client.address ? ` at ${brief.client.address}` : ''}.`, ...(extracted?.facts.slice(0, 2) ?? [])],
        image: photo(`owner of a ${kind} at work`),
        signature: brief.client.ownerName,
      } satisfies ContentOf<'about'>;
    case 'features':
      return {
        eyebrow: pageTitle === 'Home' ? 'What we offer' : pageTitle,
        heading: items.length ? 'From the list' : 'What we offer',
        intro: '',
        items: (items.length ? items.slice(0, 9) : [1, 2, 3].map((n) => ({ name: `Offer ${n}`, description: 'One line about it.', price: '', category: '' }))).map((i) => ({
          title: i.name,
          text: i.description,
          price: i.price,
          image: photo(`${i.name} at a ${kind}`),
        })),
      } satisfies ContentOf<'features'>;
    case 'gallery':
      return { heading: 'Take a look', intro: '', images: [1, 2, 3, 4].map((n) => photo(`${kind} photo ${n}`)) } satisfies ContentOf<'gallery'>;
    case 'testimonials':
      return {
        heading: 'What customers say',
        items: [
          { quote: 'A sample quote from a happy customer.', name: 'Customer name', detail: 'Sample review' },
          { quote: 'Another sample quote about something different.', name: 'Customer name', detail: 'Sample review' },
        ],
      } satisfies ContentOf<'testimonials'>;
    case 'stats':
      return {
        heading: '',
        items: extracted?.facts.length && extracted.facts.length >= 2
          ? extracted.facts.slice(0, 4).map((f) => ({ value: f.split(' ')[0].slice(0, 16), label: f.slice(0, 60) }))
          : [
              { value: '00', label: 'A number worth sharing' },
              { value: '00', label: 'Another one' },
            ],
      } satisfies ContentOf<'stats'>;
    case 'faq':
      return {
        heading: 'Questions',
        intro: '',
        items: [
          { question: 'How do I book?', answer: brief.client.whatsapp ? 'Send us a message on WhatsApp.' : 'Get in touch and we will reply.' },
          { question: 'Where are you?', answer: brief.client.address || 'See the contact page.' },
        ],
      } satisfies ContentOf<'faq'>;
    case 'cta':
      return { heading: `Visit ${name}`, text: 'We would love to see you.', button: { label: 'Get in touch', href: '/contact' }, image: photo(`${kind} entrance`) } satisfies ContentOf<'cta'>;
    case 'contact':
      return {
        heading: 'Find us',
        intro: 'How and when to reach us.',
        address: brief.client.address,
        phone: brief.client.whatsapp,
        whatsapp: brief.client.whatsapp,
        email: '',
        hours: extracted?.hours ?? [],
        mapQuery: brief.client.address,
      } satisfies ContentOf<'contact'>;
    default:
      throw new Error(`Demo provider does not write ${type}`);
  }
}

function demoParse(brief: Brief): Extracted {
  const lines = brief.paste.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const price = /([$€£₦]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP|NGN|GHS))/i;
  const hour = /\b(mon|tue|wed|thu|fri|sat|sun)\w*\b.*\d/i;
  const out: Extracted = { tagline: '', hours: [], items: [], facts: [] };
  for (const l of lines) {
    const p = price.exec(l);
    if (p) out.items.push({ name: l.replace(p[0], '').replace(/[-–—:·]+\s*$/, '').trim().slice(0, 80), description: '', price: p[0], category: '' });
    else if (hour.test(l)) {
      const m = /^(.*?)(\d.*)$/.exec(l);
      out.hours.push({ days: (m?.[1] ?? l).trim().slice(0, 40), time: (m?.[2] ?? '').trim().slice(0, 40) });
    } else if (!out.tagline) out.tagline = l.slice(0, 160);
    else out.facts.push(l.slice(0, 200));
  }
  out.hours = out.hours.slice(0, 7);
  out.facts = out.facts.slice(0, 20);
  return out;
}

export function demoClient(): ProviderClient {
  return {
    id: 'demo',
    models: { strong: 'demo-templates', light: 'demo-templates' },
    async chat(req: ChatRequest): Promise<ChatResult> {
      const ctx = req.demo as DemoContext | undefined;
      if (!ctx) throw new Error('Demo provider needs a demo context');
      await new Promise((r) => setTimeout(r, 400));
      let body: unknown;
      if (ctx.kind === 'parse') body = demoParse(ctx.brief);
      else if (ctx.kind === 'plan')
        body = {
          pages: pagesFor(ctx.brief).map((p) => ({
            path: p.path,
            title: p.title,
            sections: DEFAULT_PAGE_SECTIONS[p.key].map((s) => ({ type: s.type, variant: s.variant ?? '', note: s.note })),
          })),
        };
      else if (ctx.kind === 'chat')
        body = { reply: 'Demo mode can’t follow instructions, so nothing changed. Add an AI key in Settings → AI providers to edit by chat.', ops: [] };
      else body = { sections: ctx.page.sections.map((s) => ({ id: s.id, content: demoContent(s.type, ctx.brief, ctx.extracted, ctx.page.title) })) };
      return { text: JSON.stringify(body), model: 'demo-templates' };
    },
  };
}
