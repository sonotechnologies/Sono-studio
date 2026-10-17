import { z } from 'zod';
import { PRESET_IDS } from '@/lib/types';

/*
 * A site is one JSON document: pages, the ordered sections on each page, each
 * section's content and options, the theme tokens and which modules are on.
 * Every section's content has its own schema, so bad AI output is rejected
 * before it reaches the preview, and the editor can build controls from it.
 */

const text = (max: number) => z.string().max(max);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Use lowercase letters, numbers and dashes');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');

/** Internal page path ("/", "/about", "/#menu") or an absolute URL, tel:, mailto: or #anchor. */
export const hrefSchema = z
  .string()
  .max(500)
  .regex(/^(\/[a-z0-9\-/]*(#[a-z0-9-]+)?|#[a-z0-9-]*|https?:\/\/\S+|tel:\+?[0-9 ]+|mailto:\S+)$/i, 'Not a valid link');

export const linkSchema = z.object({ label: text(40), href: hrefSchema });
export type SiteLink = z.infer<typeof linkSchema>;

export const imageSchema = z.object({
  /** Empty means "no photo yet": a striped placeholder is shown. */
  src: z.union([z.literal(''), z.string().url().max(1000), z.string().regex(/^\/[^\s]*$/).max(500)]),
  alt: text(200),
  /** Photographer credit, required by Unsplash and Pexels. */
  credit: text(120).optional(),
});
export type SiteImage = z.infer<typeof imageSchema>;

/* ---------- Section content ---------- */

export const navbarContent = z.object({
  brand: text(60),
  logo: imageSchema.optional(),
  links: z.array(linkSchema).max(6),
  cta: linkSchema.optional(),
  /** Stays at the top of the screen while scrolling. */
  sticky: z.boolean().optional(),
});

export const heroContent = z.object({
  eyebrow: text(60),
  heading: text(120),
  subheading: text(300),
  primaryCta: linkSchema.optional(),
  secondaryCta: linkSchema.optional(),
  image: imageSchema,
});

export const aboutContent = z.object({
  eyebrow: text(60),
  heading: text(120),
  body: z.array(text(800)).min(1).max(4),
  image: imageSchema,
  signature: text(80).optional(),
});

export const featuresContent = z.object({
  eyebrow: text(60),
  heading: text(120),
  intro: text(300),
  items: z
    .array(
      z.object({
        title: text(80),
        text: text(300),
        price: text(24).optional(),
        image: imageSchema.optional(),
      }),
    )
    .min(1)
    .max(9),
});

export const galleryContent = z.object({
  heading: text(120),
  intro: text(300),
  images: z.array(imageSchema).min(2).max(12),
});

export const testimonialsContent = z.object({
  heading: text(120),
  items: z
    .array(z.object({ quote: text(400), name: text(60), detail: text(60) }))
    .min(1)
    .max(6),
  /** Average rating out of 5, shown on the rating-strip variant. */
  rating: z.number().min(0).max(5).optional(),
  ratingCount: text(40).optional(),
});

export const statsContent = z.object({
  heading: text(120),
  items: z
    .array(z.object({ value: text(16), label: text(60) }))
    .min(2)
    .max(4),
});

export const faqContent = z.object({
  heading: text(120),
  intro: text(300),
  items: z
    .array(z.object({ question: text(160), answer: text(800) }))
    .min(1)
    .max(12),
});

export const ctaContent = z.object({
  heading: text(120),
  text: text(300),
  button: linkSchema,
  secondary: linkSchema.optional(),
  image: imageSchema.optional(),
});

export const contactContent = z.object({
  heading: text(120),
  intro: text(300),
  address: text(200),
  phone: text(32),
  whatsapp: text(32),
  email: text(120),
  hours: z.array(z.object({ days: text(40), time: text(40) })).max(7),
  /** Address or place name for the map; empty hides the map. */
  mapQuery: text(200),
});

export const footerContent = z.object({
  brand: text(60),
  tagline: text(160),
  links: z.array(linkSchema).max(8),
  instagram: text(60),
  whatsapp: text(32),
  note: text(160),
});

export const whatsappFloatContent = z.object({
  number: text(32),
  message: text(200),
  label: text(30),
});

/* ---------- Store ---------- */

export const productSchema = z.object({
  id,
  name: text(80),
  /** In the store's currency, e.g. 4500 or 12.5. */
  price: z.number().min(0).max(100_000_000),
  /** The old price, shown struck through. */
  compareAt: z.number().min(0).max(100_000_000).optional(),
  category: text(40),
  description: text(600),
  image: imageSchema,
  /** More photos on the product page. */
  images: z.array(imageSchema).max(6).optional(),
  /** Choices such as Size or Colour. */
  options: z.array(z.object({ name: text(24), values: z.array(text(24)).min(1).max(12) })).max(2).optional(),
  soldOut: z.boolean().optional(),
  /** Placeholder made when no products were given; the checklist asks for real ones. */
  sample: z.boolean().optional(),
});
export type Product = z.infer<typeof productSchema>;

export const storeSchema = z.object({
  /** ISO 4217 code: NGN, GHS, KES, ZAR, USD, EUR, GBP, ... */
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** Where WhatsApp orders go (digits, with country code). */
  whatsapp: text(32),
  products: z.array(productSchema).max(300),
  /**
   * How visitors pay. WhatsApp ordering is on unless switched off; card
   * payments use the business's own Paystack or Stripe account. Missing means
   * WhatsApp only.
   */
  payments: z.object({ whatsapp: z.boolean(), paystack: z.boolean(), stripe: z.boolean() }).optional(),
});
export type Store = z.infer<typeof storeSchema>;
export type PaymentProvider = 'paystack' | 'stripe';

export const productGridContent = z.object({
  eyebrow: text(60),
  heading: text(120),
  intro: text(300),
  /** Only this category; empty shows every product. */
  category: text(40),
  /** Category buttons above the grid. */
  filter: z.boolean().optional(),
  /** At most this many products (the first in the list); empty shows all. */
  limit: z.number().int().min(1).max(60).optional(),
  /** Products per row on phones: 1 (each card the full width) or 2 (the default). */
  phoneColumns: z.number().int().min(1).max(2).optional(),
});

export const productFeatureContent = z.object({
  eyebrow: text(60),
  /** The product to show; empty picks the first. */
  productId: text(64),
  /** Overrides the product name as the heading. */
  heading: text(120),
});

/** A product's own page. Made for every product, not placed by hand. */
export const productDetailContent = z.object({ productId: text(64) });

/* ---------- Bookings ---------- */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00');

export const serviceSchema = z.object({
  id,
  name: text(80),
  /** Minutes. */
  duration: z.number().int().min(5).max(720),
  /** In the bookings currency; 0 means price on request. */
  price: z.number().min(0).max(100_000_000),
  description: text(400),
  category: text(40),
  sample: z.boolean().optional(),
});
export type Service = z.infer<typeof serviceSchema>;

export const bookingsSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** Where booking requests go (digits, with country code). */
  whatsapp: text(32),
  /** IANA time zone the opening hours are in, e.g. Africa/Lagos. */
  timezone: z.string().max(60).regex(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/),
  services: z.array(serviceSchema).max(60),
  /** Weekly opening hours: day 0 is Sunday. A day can have up to two spans (e.g. a lunch break). */
  hours: z.array(z.object({ day: z.number().int().min(0).max(6), open: hhmm, close: hhmm })).max(14),
  /** Minutes between possible start times. */
  step: z.number().int().min(5).max(240),
  /** Bookings at the same time, e.g. two stylists. */
  capacity: z.number().int().min(1).max(20),
  /** Hours of notice needed. */
  notice: z.number().int().min(0).max(168),
  /** How far ahead people can book, in days. */
  daysAhead: z.number().int().min(1).max(180),
  /** Days the business is closed (YYYY-MM-DD), on top of the weekly hours. */
  closed: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
  /** Share of the price paid upfront by card, 0 to 100. 0 means no deposit. */
  depositPercent: z.number().int().min(0).max(100),
  /** How a booking is made: a WhatsApp request, or confirmed by paying the deposit. */
  payments: z.object({ whatsapp: z.boolean(), paystack: z.boolean(), stripe: z.boolean() }),
});
export type Bookings = z.infer<typeof bookingsSchema>;

export const bookingContent = z.object({
  eyebrow: text(60),
  heading: text(120),
  intro: text(300),
  /** Only this category of services; empty shows them all. */
  category: text(40),
});

/* ---------- AI-written sections ---------- */

const fieldKey = z.string().regex(/^[a-z][a-zA-Z0-9]{0,30}$/, 'Use camelCase letters');
const simpleField = z.enum(['text', 'paragraph', 'image', 'link']);

/** One editable field of an AI-written section; a list holds items made of simple fields. */
export const customFieldSchema = z.object({
  key: fieldKey,
  label: text(40),
  type: z.union([simpleField, z.literal('list')]),
  fields: z.array(z.object({ key: fieldKey, label: text(40), type: simpleField })).min(1).max(8).optional(),
  /** Most items in a list. */
  max: z.number().int().min(1).max(24).optional(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

export const customDefSchema = z.object({
  name: text(60),
  /** What it's for, in a sentence: what the AI was asked for. */
  purpose: text(300),
  fields: z.array(customFieldSchema).min(1).max(16),
  /** The component's source (TSX), as written and checked. */
  code: z.string().max(20_000),
  /** The same, compiled for the sandboxed preview. */
  js: z.string().max(60_000),
  /** Set by you after reading the code; the handover checklist asks for it. */
  reviewed: z.boolean(),
});
export type CustomDef = z.infer<typeof customDefSchema>;

/** The content an AI-written section's fields describe. */
export function customDataSchema(fields: CustomField[]): z.ZodType {
  const simple = (f: { type: z.infer<typeof simpleField>; label: string }) =>
    (f.type === 'text' ? text(200) : f.type === 'paragraph' ? text(1500) : f.type === 'image' ? imageSchema : linkSchema).describe(f.label);
  return z.object(
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.type === 'list' ? z.array(z.object(Object.fromEntries((f.fields ?? []).map((sub) => [sub.key, simple(sub)])))).max(f.max ?? 12).describe(f.label) : simple(f as { type: z.infer<typeof simpleField>; label: string }),
      ]),
    ),
  );
}

export const customContent = z.object({
  /** Which entry of the site's customSections this is. */
  component: id,
  data: z.record(z.string(), z.unknown()),
});

/* ---------- Section instances ---------- */

const base = { id, hidden: z.boolean().optional() };

export const sectionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('navbar'), variant: z.enum(['inline', 'centered']), content: navbarContent }),
  z.object({
    ...base,
    type: z.literal('hero'),
    variant: z.enum(['split-photo', 'full-bleed', 'centered', 'oversized-type']),
    content: heroContent,
  }),
  z.object({ ...base, type: z.literal('about'), variant: z.enum(['split', 'statement']), content: aboutContent }),
  z.object({
    ...base,
    type: z.literal('features'),
    variant: z.enum(['cards', 'numbered', 'price-list']),
    content: featuresContent,
  }),
  z.object({
    ...base,
    type: z.literal('gallery'),
    variant: z.enum(['portrait-grid', 'masonry', 'strip']),
    content: galleryContent,
  }),
  z.object({
    ...base,
    type: z.literal('testimonials'),
    variant: z.enum(['quotes', 'cards', 'rating-strip']),
    content: testimonialsContent,
  }),
  z.object({ ...base, type: z.literal('stats'), variant: z.enum(['row', 'cards']), content: statsContent }),
  z.object({ ...base, type: z.literal('faq'), variant: z.enum(['accordion', 'two-column']), content: faqContent }),
  z.object({ ...base, type: z.literal('cta'), variant: z.enum(['banner', 'split', 'boxed']), content: ctaContent }),
  z.object({
    ...base,
    type: z.literal('contact'),
    variant: z.enum(['map-and-hours', 'card']),
    content: contactContent,
  }),
  z.object({ ...base, type: z.literal('footer'), variant: z.enum(['simple', 'columns']), content: footerContent }),
  z.object({ ...base, type: z.literal('product-grid'), variant: z.enum(['cards', 'minimal', 'list']), content: productGridContent }),
  z.object({ ...base, type: z.literal('product-feature'), variant: z.enum(['split', 'centered']), content: productFeatureContent }),
  z.object({ ...base, type: z.literal('product-detail'), variant: z.enum(['gallery', 'compact']), content: productDetailContent }),
  z.object({ ...base, type: z.literal('booking'), variant: z.enum(['steps', 'split']), content: bookingContent }),
  z.object({ ...base, type: z.literal('custom'), variant: z.enum(['default']), content: customContent }),
  z.object({
    ...base,
    type: z.literal('whatsapp-float'),
    variant: z.enum(['bubble', 'pill']),
    content: whatsappFloatContent,
  }),
]);

export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section['type'];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;
export type VariantOf<T extends SectionType> = SectionOf<T>['variant'];
export type ContentOf<T extends SectionType> = SectionOf<T>['content'];

/* ---------- Theme ---------- */

export const themeSchema = z.object({
  preset: z.enum(PRESET_IDS),
  mode: z.enum(['light', 'dark']),
  colors: z.object({
    background: color,
    surface: color,
    text: color,
    muted: color,
    primary: color,
    onPrimary: color,
    accent: color,
  }),
  fonts: z.object({ heading: text(60), body: text(60) }),
  radius: z.object({
    card: z.number().int().min(0).max(999),
    button: z.number().int().min(0).max(999),
    input: z.number().int().min(0).max(999),
  }),
  /** Scroll reveals and hover movement. Absent means none. */
  motion: z.enum(['none', 'subtle', 'lively']).optional(),
  /** Space between and inside sections, relative to the preset. Absent means balanced. */
  density: z.enum(['compact', 'balanced', 'airy']).optional(),
  /** Preferred layout per section type ("hero": "full-bleed"), over the preset's own. Used for new sections and plans. */
  layouts: z.record(z.string().regex(/^[a-z-]{2,30}$/), z.string().max(40)).optional(),
});
export type SiteTheme = z.infer<typeof themeSchema>;

/* ---------- Site ---------- */

export const pageSchema = z.object({
  id,
  /** "/" for home, otherwise "/about", "/menu", ... */
  path: z.string().regex(/^\/([a-z0-9-]+)?$/),
  title: text(60),
  sections: z.array(sectionSchema).max(30),
});
export type SitePage = z.infer<typeof pageSchema>;

export const MODULE_IDS = [
  'contact-form',
  'catalogue',
  'cart-orders',
  'whatsapp-ordering',
  'paystack',
  'stripe',
  'booking',
  'admin',
] as const;

export const siteConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    meta: z.object({
      businessName: text(80),
      description: text(300),
      language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    }),
    theme: themeSchema,
    pages: z.array(pageSchema).min(1).max(12),
    modules: z.partialRecord(z.enum(MODULE_IDS), z.boolean()),
    /** Products and ordering, for online stores. */
    store: storeSchema.optional(),
    /** Services, hours and deposits, for booking sites. */
    bookings: bookingsSchema.optional(),
    /** AI-written sections, by id, used by sections of type "custom". */
    customSections: z.record(id, customDefSchema).optional(),
  })
  .superRefine((site, ctx) => {
    const paths = new Set<string>();
    const sectionIds = new Set<string>();
    if (!site.pages.some((p) => p.path === '/')) ctx.addIssue({ code: 'custom', message: 'A home page ("/") is required', path: ['pages'] });
    site.pages.forEach((p, pi) => {
      if (paths.has(p.path)) ctx.addIssue({ code: 'custom', message: `Duplicate page path ${p.path}`, path: ['pages', pi, 'path'] });
      paths.add(p.path);
      p.sections.forEach((s, si) => {
        if (sectionIds.has(s.id)) ctx.addIssue({ code: 'custom', message: `Duplicate section id ${s.id}`, path: ['pages', pi, 'sections', si, 'id'] });
        sectionIds.add(s.id);
      });
    });
    const productIds = new Set<string>();
    site.store?.products.forEach((p, i) => {
      if (productIds.has(p.id)) ctx.addIssue({ code: 'custom', message: `Duplicate product id ${p.id}`, path: ['store', 'products', i, 'id'] });
      productIds.add(p.id);
    });
    const serviceIds = new Set<string>();
    site.bookings?.services.forEach((s, i) => {
      if (serviceIds.has(s.id)) ctx.addIssue({ code: 'custom', message: `Duplicate service id ${s.id}`, path: ['bookings', 'services', i, 'id'] });
      serviceIds.add(s.id);
    });
    const customs = site.customSections ?? {};
    if (Object.keys(customs).length > 12) ctx.addIssue({ code: 'custom', message: 'At most 12 custom sections', path: ['customSections'] });
    site.pages.forEach((p, pi) =>
      p.sections.forEach((s, si) => {
        if (s.type !== 'custom') return;
        const def = customs[s.content.component];
        if (!def) return ctx.addIssue({ code: 'custom', message: `No custom section "${s.content.component}"`, path: ['pages', pi, 'sections', si, 'content', 'component'] });
        const check = customDataSchema(def.fields).safeParse(s.content.data);
        if (!check.success) ctx.addIssue({ code: 'custom', message: check.error.issues[0]?.message ?? 'Invalid content', path: ['pages', pi, 'sections', si, 'content', 'data', ...(check.error.issues[0]?.path.map(String) ?? [])] });
      }),
    );
    site.bookings?.hours.forEach((h, i) => {
      if (h.close <= h.open) ctx.addIssue({ code: 'custom', message: 'Closing time must be after opening time', path: ['bookings', 'hours', i, 'close'] });
    });
  });

export type SiteConfig = z.infer<typeof siteConfigSchema>;
