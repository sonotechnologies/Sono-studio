import { z } from 'zod';
import { PRESET_IDS, type PresetId } from '@/lib/types';
import { SECTION_TYPES } from '@/site/registry';
import { themeSchema, type CustomDef, type Section, type SectionType } from '@/site/schema';

/* ---------- What the wizard collects ---------- */

export const PAGE_OPTIONS = [
  { key: 'home', path: '/', title: 'Home', note: 'Always included' },
  { key: 'shop', path: '/shop', title: 'Shop', note: 'Products with prices, a cart and orders on WhatsApp' },
  { key: 'book', path: '/book', title: 'Book', note: 'Services, free times and booking with a deposit or on WhatsApp' },
  { key: 'menu', path: '/menu', title: 'Menu', note: 'Dishes and prices' },
  { key: 'services', path: '/services', title: 'Services', note: 'Treatments, packages or services' },
  { key: 'rooms', path: '/rooms', title: 'Rooms', note: 'Rooms and rates' },
  { key: 'about', path: '/about', title: 'About', note: 'The story and the team' },
  { key: 'gallery', path: '/gallery', title: 'Gallery', note: 'Photos' },
  { key: 'contact', path: '/contact', title: 'Contact', note: 'Map, hours, WhatsApp' },
] as const;
export type PageKey = (typeof PAGE_OPTIONS)[number]['key'];
export const PAGE_KEYS = PAGE_OPTIONS.map((p) => p.key) as [PageKey, ...PageKey[]];

/** Business kinds from the design, with the preset and pages each one suggests. */
export const BUSINESS_KINDS: { name: string; desc: string; preset: PresetId; pages: PageKey[] }[] = [
  { name: 'Restaurant', desc: 'Menu, bookings, opening hours', preset: 'warm-table', pages: ['home', 'menu', 'about', 'contact'] },
  { name: 'Hotel', desc: 'Rooms, rates, location', preset: 'luxe-minimal', pages: ['home', 'rooms', 'gallery', 'contact'] },
  { name: 'Salon', desc: 'Services, prices, booking', preset: 'luxe-minimal', pages: ['home', 'services', 'book', 'about', 'contact'] },
  { name: 'Fashion boutique', desc: 'Collections, lookbook, visit', preset: 'luxe-minimal', pages: ['home', 'shop', 'gallery', 'about', 'contact'] },
  { name: 'Streetwear', desc: 'Drops, products, socials', preset: 'bold-street', pages: ['home', 'shop', 'gallery', 'contact'] },
  { name: 'Bakery', desc: 'Daily bakes, orders, pickup', preset: 'warm-table', pages: ['home', 'menu', 'contact'] },
  { name: 'Travel agency', desc: 'Trips, packages, enquiries', preset: 'clean-corporate', pages: ['home', 'services', 'about', 'contact'] },
  { name: 'Gadget store', desc: 'Products, specs, delivery', preset: 'tech-dark', pages: ['home', 'shop', 'contact'] },
  { name: 'Wellness studio', desc: 'Treatments, classes, booking', preset: 'soft-studio', pages: ['home', 'services', 'book', 'about', 'contact'] },
];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const briefSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  businessType: z.string().trim().min(1).max(60),
  preset: z.enum(PRESET_IDS),
  pages: z.array(z.enum(PAGE_KEYS)).min(1).max(PAGE_OPTIONS.length),
  /** Pasted text, or the content imported from the client's current site (pages marked with "## Page" headings). */
  paste: z.string().max(12000),
  client: z.object({
    ownerName: z.string().max(80),
    whatsapp: z.string().max(32),
    instagram: z.string().max(60),
    address: z.string().max(160),
  }),
  /** Colours pulled from the logo in the browser; applied only when `useBrand` is on. */
  brandColors: z.array(hex).max(5),
  useBrand: z.boolean(),
  /**
   * A style of your own, or one read from a reference, copied in when chosen so
   * later edits to the saved style don't change a site being generated.
   * `preset` is then its base preset (layouts and type scale).
   */
  style: z.object({ id: z.string().max(64), name: z.string().max(60), theme: themeSchema }).nullable().optional(),
  /** For a site with a Shop page; unset means read it from the prices given. */
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  /** For a site with a Book page: the time zone its opening hours are in. */
  timezone: z.string().max(60).regex(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/).optional(),
});
export type Brief = z.infer<typeof briefSchema>;

export function pagesFor(brief: Pick<Brief, 'pages'>) {
  const wanted = new Set<PageKey>(['home', ...brief.pages]);
  return PAGE_OPTIONS.filter((p) => wanted.has(p.key));
}

/* ---------- Ingest: pasted text turned into structure ---------- */

/** Text and lists from a model, trimmed to fit rather than rejected for running long. */
const cut = (n: number) => z.string().catch('').transform((v) => v.trim().slice(0, n));
const upTo = <T extends z.ZodType>(item: T, n: number) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list
        .flatMap((x) => {
          const r = item.safeParse(x);
          return r.success ? [r.data as z.output<T>] : [];
        })
        .slice(0, n),
    );

export const extractedSchema = z.object({
  tagline: cut(160),
  hours: upTo(z.object({ days: cut(40), time: cut(40) }), 7),
  items: upTo(z.object({ name: z.string().trim().min(1).transform((v) => v.slice(0, 80)), description: cut(300), price: cut(24), category: cut(60) }), 60),
  facts: upTo(cut(200), 20),
  /** Reviews quoted in the notes, word for word, with who wrote them. */
  reviews: upTo(z.object({ quote: z.string().trim().min(1).transform((v) => v.slice(0, 400)), name: cut(60) }), 6).optional(),
  /** An email address given in the notes. */
  email: z
    .string()
    .catch('')
    .transform((v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().slice(0, 120) : ''))
    .optional(),
});
export type Extracted = z.infer<typeof extractedSchema>;

export const EMPTY_EXTRACTED: Extracted = { tagline: '', hours: [], items: [], facts: [] };

/* ---------- Plan ---------- */

/** Text from a model, trimmed to fit rather than rejected for running long. */
const clip = (n: number) => z.string().transform((v) => v.trim().slice(0, n));

/*
 * What the model returns. Deliberately lenient: unknown section types, bad
 * variants and long notes are fixed up by normalisePlan, so a mostly-good plan
 * from a weaker model is kept instead of failing the whole step.
 */
export const rawPlanSchema = z.object({
  pages: z
    .array(
      z.object({
        path: clip(40).default('/'),
        title: clip(60).default(''),
        sections: z
          .array(z.object({ type: clip(40), variant: clip(40).optional(), note: clip(200).optional() }))
          .transform((list) => list.slice(0, 16)),
      }),
    )
    .min(1)
    .transform((list) => list.slice(0, 8)),
});
export type RawPlan = z.infer<typeof rawPlanSchema>;

export interface PlanSection {
  id: string;
  type: SectionType;
  variant: string;
  note: string;
  /** For a custom section: what the AI wrote, once written (or why it couldn't). */
  custom?: { def: CustomDef; data: Record<string, unknown> } | { failed: string };
}
export interface PlanPage {
  id: string;
  path: string;
  title: string;
  sections: PlanSection[];
}
export interface Plan {
  pages: PlanPage[];
}

/* ---------- Jobs ---------- */

export type JobStatus = 'draft' | 'running' | 'plan_review' | 'done' | 'failed';

export interface StepLog {
  key: string;
  label: string;
  status: 'done' | 'failed' | 'skipped';
  provider?: string;
  model?: string;
  ms: number;
  at: string;
  detail?: string;
}

export interface GenerationJob {
  id: string;
  projectId: string;
  status: JobStatus;
  brief: Brief;
  extracted: Extracted | null;
  plan: Plan | null;
  /** Sections written so far, per plan page id. */
  filled: Record<string, Section[]>;
  imagesDone: boolean;
  steps: StepLog[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Assets ---------- */

export interface Asset {
  id: string;
  projectId: string;
  kind: 'photo' | 'logo';
  source: 'upload' | 'unsplash' | 'pexels';
  url: string;
  alt: string;
  credit: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}
