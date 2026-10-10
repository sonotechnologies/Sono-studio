import { z } from 'zod';
import { PRESET_IDS, type PresetId } from '@/lib/types';
import { SECTION_TYPES } from '@/site/registry';
import type { Section, SectionType } from '@/site/schema';

/* ---------- What the wizard collects ---------- */

export const PAGE_OPTIONS = [
  { key: 'home', path: '/', title: 'Home', note: 'Always included' },
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
  { name: 'Salon', desc: 'Services, prices, booking', preset: 'luxe-minimal', pages: ['home', 'services', 'about', 'contact'] },
  { name: 'Fashion boutique', desc: 'Collections, lookbook, visit', preset: 'luxe-minimal', pages: ['home', 'gallery', 'about', 'contact'] },
  { name: 'Streetwear', desc: 'Drops, products, socials', preset: 'bold-street', pages: ['home', 'gallery', 'contact'] },
  { name: 'Bakery', desc: 'Daily bakes, orders, pickup', preset: 'warm-table', pages: ['home', 'menu', 'contact'] },
  { name: 'Travel agency', desc: 'Trips, packages, enquiries', preset: 'clean-corporate', pages: ['home', 'services', 'about', 'contact'] },
  { name: 'Gadget store', desc: 'Products, specs, delivery', preset: 'tech-dark', pages: ['home', 'services', 'contact'] },
  { name: 'Wellness studio', desc: 'Treatments, classes, booking', preset: 'soft-studio', pages: ['home', 'services', 'about', 'contact'] },
];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const briefSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  businessType: z.string().trim().min(1).max(60),
  preset: z.enum(PRESET_IDS),
  pages: z.array(z.enum(PAGE_KEYS)).min(1).max(PAGE_OPTIONS.length),
  paste: z.string().max(6000),
  client: z.object({
    ownerName: z.string().max(80),
    whatsapp: z.string().max(32),
    instagram: z.string().max(60),
    address: z.string().max(160),
  }),
  /** Colours pulled from the logo in the browser; applied only when `useBrand` is on. */
  brandColors: z.array(hex).max(5),
  useBrand: z.boolean(),
});
export type Brief = z.infer<typeof briefSchema>;

export function pagesFor(brief: Pick<Brief, 'pages'>) {
  const wanted = new Set<PageKey>(['home', ...brief.pages]);
  return PAGE_OPTIONS.filter((p) => wanted.has(p.key));
}

/* ---------- Ingest: pasted text turned into structure ---------- */

export const extractedSchema = z.object({
  tagline: z.string().max(160),
  hours: z.array(z.object({ days: z.string().max(40), time: z.string().max(40) })).max(7),
  items: z
    .array(
      z.object({
        name: z.string().max(80),
        description: z.string().max(300),
        price: z.string().max(24),
        category: z.string().max(60),
      }),
    )
    .max(60),
  facts: z.array(z.string().max(200)).max(20),
});
export type Extracted = z.infer<typeof extractedSchema>;

export const EMPTY_EXTRACTED: Extracted = { tagline: '', hours: [], items: [], facts: [] };

/* ---------- Plan ---------- */

const planSection = z.object({
  type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]),
  variant: z.string().max(40),
  note: z.string().max(200),
});

/** What the model returns. Normalised against the request before anyone sees it. */
export const rawPlanSchema = z.object({
  pages: z
    .array(z.object({ path: z.string().max(40), title: z.string().max(60), sections: z.array(planSection).max(16) }))
    .min(1)
    .max(8),
});
export type RawPlan = z.infer<typeof rawPlanSchema>;

export interface PlanSection {
  id: string;
  type: SectionType;
  variant: string;
  note: string;
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
