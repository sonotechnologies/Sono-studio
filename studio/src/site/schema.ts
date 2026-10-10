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
  });

export type SiteConfig = z.infer<typeof siteConfigSchema>;
