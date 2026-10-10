import { PRESETS } from '@/lib/presets';
import { SECTIONS } from '@/site/registry';
import type { SectionType } from '@/site/schema';
import { PREFERRED_VARIANTS } from '@/site/starter';
import { pagesFor, type Brief, type Extracted, type PageKey, type Plan, type PlanSection, type RawPlan } from './brief';

/** Navbar, footer and the WhatsApp button are added to every page by the assembler, not planned. */
export const FIXED_TYPES: SectionType[] = ['navbar', 'footer', 'whatsapp-float'];
export const PLANNABLE_TYPES = (Object.keys(SECTIONS) as SectionType[]).filter((t) => !FIXED_TYPES.includes(t));

/** Sensible sections per page, used when the model leaves a page out and by the demo provider. */
type SourceSection = { type: string; note?: string; variant?: string };

export const DEFAULT_PAGE_SECTIONS: Record<PageKey, { type: SectionType; note: string; variant?: string }[]> = {
  home: [
    { type: 'hero', note: 'Headline, one-line pitch and the main action' },
    { type: 'about', note: 'Short story of the business' },
    { type: 'features', note: 'Three things people come for' },
    { type: 'testimonials', note: 'What customers say' },
    { type: 'gallery', note: 'Photos of the place and the work' },
    { type: 'cta', note: 'Invite people to book, order or visit' },
  ],
  menu: [
    { type: 'hero', variant: 'centered', note: 'Menu page header' },
    { type: 'features', variant: 'price-list', note: 'The menu with prices' },
    { type: 'cta', note: 'Book or order' },
  ],
  services: [
    { type: 'hero', variant: 'centered', note: 'Services page header' },
    { type: 'features', note: 'Each service with price if known' },
    { type: 'faq', note: 'Questions before booking' },
    { type: 'cta', note: 'Book an appointment' },
  ],
  rooms: [
    { type: 'hero', variant: 'centered', note: 'Rooms page header' },
    { type: 'features', variant: 'cards', note: 'Each room type' },
    { type: 'gallery', note: 'Rooms and views' },
    { type: 'cta', note: 'Check availability' },
  ],
  about: [
    { type: 'about', variant: 'statement', note: 'The full story' },
    { type: 'gallery', variant: 'masonry', note: 'The people and the place' },
    { type: 'cta', note: 'Come and visit' },
  ],
  gallery: [
    { type: 'hero', variant: 'centered', note: 'Gallery header' },
    { type: 'gallery', variant: 'masonry', note: 'All the photos' },
  ],
  contact: [
    { type: 'contact', note: 'Address, hours, map and WhatsApp' },
    { type: 'faq', note: 'Practical questions: parking, groups, payment' },
  ],
};

function catalogue(): string {
  return PLANNABLE_TYPES.map((t) => {
    const d = SECTIONS[t];
    return `- ${t}: ${d.purpose}. Variants: ${d.variants.map((v) => `${v.id} (${v.note})`).join(', ')}`;
  }).join('\n');
}

export function briefSummary(brief: Brief, extracted: Extracted | null): string {
  const lines = [
    `Business: ${brief.businessName}`,
    `Kind of business: ${brief.businessType}`,
    `Style preset: ${PRESETS[brief.preset].name} (${PRESETS[brief.preset].feel})`,
    brief.client.address && `Address: ${brief.client.address}`,
    brief.client.whatsapp && 'Takes enquiries on WhatsApp',
    brief.client.instagram && `Instagram: ${brief.client.instagram}`,
  ];
  if (extracted) {
    if (extracted.tagline) lines.push(`Their own words: ${extracted.tagline}`);
    if (extracted.facts.length) lines.push(`Facts given: ${extracted.facts.join(' | ')}`);
    if (extracted.items.length) lines.push(`They gave ${extracted.items.length} menu or price-list items`);
    if (extracted.hours.length) lines.push(`Opening hours given: ${extracted.hours.map((h) => `${h.days} ${h.time}`).join(', ')}`);
  }
  return lines.filter(Boolean).join('\n');
}

export function planPrompt(brief: Brief, extracted: Extracted | null) {
  const pages = pagesFor(brief);
  const preferred = PREFERRED_VARIANTS[brief.preset];
  return {
    system:
      'You plan small-business websites built from a fixed library of sections. You reply with a single JSON object and nothing else.',
    prompt: `Plan the website below.

${briefSummary(brief, extracted)}

Pages to plan, in this order:
${pages.map((p) => `- path "${p.path}", title "${p.title}" (${p.note})`).join('\n')}

Section library (use only these types and variants; navbar, footer and the WhatsApp button are added automatically, so leave them out):
${catalogue()}

This preset prefers: ${Object.entries(preferred)
      .filter(([t]) => PLANNABLE_TYPES.includes(t as SectionType))
      .map(([t, v]) => `${t}=${v}`)
      .join(', ')}

Rules:
- The home page has 4 to 7 sections and starts with a hero. Other pages have 2 to 5.
- Only include "stats" if real numbers were given in the facts.
- Each section gets a "note": one short line saying the section's job, e.g. "the rooms, with prices if known".
- Notes must not invent anything. Only mention amenities, services, products, rooms, materials, places or numbers that appear in the facts above. Nothing is known beyond what is listed.
- Only include "faq" if the facts or contact details can answer real questions.
- Vary variants across pages so the site doesn't repeat itself.

Reply with JSON in exactly this shape:
{"pages":[{"path":"/","title":"Home","sections":[{"type":"hero","variant":"split-photo","note":"..."}]}]}`,
  };
}

function validVariant(type: SectionType, variant: string | undefined, preset: Brief['preset']): string {
  const ids = SECTIONS[type].variants.map((v) => v.id as string);
  if (variant && ids.includes(variant)) return variant;
  const pref = PREFERRED_VARIANTS[preset][type] as string | undefined;
  return pref && ids.includes(pref) ? pref : ids[0];
}

/**
 * Makes a model's plan safe: exactly the requested pages in order, only
 * plannable section types, valid variants, unique ids and sensible counts.
 * Pages the model left out get the default sections.
 */
export function normalisePlan(raw: RawPlan | null, brief: Brief, extracted: Extracted | null): Plan {
  const hasFacts = (extracted?.facts.length ?? 0) > 0;
  const wanted = pagesFor(brief);
  const norm = (path: string) => path.trim().replace(/\/+$/, '') || '/';
  // Match pages by path, then by title, across all pages first, so a page the
  // model reordered or skipped can't take another page's sections.
  const match = new Map<string, number>();
  const used = new Set<number>();
  for (const by of ['path', 'title'] as const) {
    for (const want of wanted) {
      if (match.has(want.key)) continue;
      const i = raw?.pages.findIndex((p, j) => !used.has(j) && (by === 'path' ? norm(p.path) === want.path : p.title.trim().toLowerCase() === want.title.toLowerCase())) ?? -1;
      if (i >= 0) {
        match.set(want.key, i);
        used.add(i);
      }
    }
  }
  // Only when the model returned exactly the pages asked for, in order, trust position for the rest.
  if (raw && raw.pages.length === wanted.length) {
    wanted.forEach((want, i) => {
      if (!match.has(want.key) && !used.has(i)) {
        match.set(want.key, i);
        used.add(i);
      }
    });
  }
  return {
    pages: wanted.map((want) => {
      const pi = match.get(want.key) ?? -1;
      const source: SourceSection[] = pi >= 0 && raw ? raw.pages[pi].sections : DEFAULT_PAGE_SECTIONS[want.key];
      const known = (t: string): t is SectionType => PLANNABLE_TYPES.includes(t as SectionType);
      let sections = source
        .map((s) => ({ ...s, type: s.type.toLowerCase().replace(/[\s_]+/g, '-') }))
        .filter((s): s is SourceSection & { type: SectionType } => known(s.type) && (s.type !== 'stats' || hasFacts));
      if (!sections.length) sections = DEFAULT_PAGE_SECTIONS[want.key];
      const hasItems = (extracted?.items.length ?? 0) > 0;
      const counts: Record<string, number> = {};
      const out: PlanSection[] = sections.slice(0, 12).map((s) => {
        counts[s.type] = (counts[s.type] ?? 0) + 1;
        return {
          id: `${want.key}-${s.type}${counts[s.type] > 1 ? `-${counts[s.type]}` : ''}`,
          type: s.type,
          // A price list with no prices to show reads as broken; use cards instead.
          variant: s.type === 'features' && !hasItems && s.variant === 'price-list' ? 'cards' : validVariant(s.type, s.variant, brief.preset),
          note: (s.note || SECTIONS[s.type].purpose).slice(0, 200),
        };
      });
      return { id: want.key, path: want.path, title: want.title, sections: out };
    }),
  };
}

/** Checks a plan edited in the review screen before writing starts. */
export function cleanEditedPlan(plan: Plan, brief: Brief): Plan {
  const ids = new Set<string>();
  return {
    pages: plan.pages.map((p) => ({
      ...p,
      sections: p.sections
        .filter((s) => PLANNABLE_TYPES.includes(s.type))
        .slice(0, 12)
        .map((s, i) => {
          let id = s.id.replace(/[^a-z0-9-]/g, '').slice(0, 60) || `${p.id}-${s.type}-${i}`;
          while (ids.has(id)) id = `${id}-x`;
          ids.add(id);
          return { id, type: s.type, variant: validVariant(s.type, s.variant, brief.preset), note: s.note.slice(0, 200) };
        }),
    })),
  };
}
