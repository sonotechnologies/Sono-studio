import { PRESETS } from '@/lib/presets';
import { siteConfigSchema, type Section, type SiteConfig, type SiteTheme } from '@/site/schema';
import { contrast, readableOn, themeFromPreset } from '@/site/theme';
import type { Asset, Brief, Extracted, Plan } from './brief';
import { bookingsFor, storeFor } from './products';

/**
 * Logo colours replace the preset's primary and accent, but only where they
 * stay readable: the primary also colours small text and buttons, so it needs
 * 3:1 against the background or it becomes the accent instead.
 */
export function brandOverrides(brief: Brief): { primary?: string; accent?: string } {
  if (!brief.useBrand || !brief.brandColors.length) return {};
  const base = brief.style?.theme.colors ?? themeFromPreset(brief.preset).colors;
  const readable = brief.brandColors.filter((c) => contrast(c, base.background) >= 3);
  const primary = readable[0];
  const accent = brief.brandColors.find((c) => c !== primary);
  return { ...(primary ? { primary } : {}), ...(accent ? { accent } : {}) };
}

/**
 * Points every internal link at something that exists: a page that was not
 * built goes to home, and a "#section" that is not on its page goes to the
 * top of that page.
 */
export function fixLinks(config: SiteConfig): SiteConfig {
  const pages = new Map(config.pages.map((p) => [p.path, new Set(p.sections.map((s) => s.id))]));
  const fix = (href: string, pagePath: string): string => {
    const m = /^(\/[a-z0-9-]*)?#([a-z0-9-]*)$/i.exec(href);
    if (m) {
      const target = m[1] || pagePath;
      if (!pages.has(target)) return '/';
      return pages.get(target)!.has(m[2]) ? href : target;
    }
    if (href.startsWith('/') && !pages.has(href.replace(/\/+$/, '') || '/')) return '/';
    return href;
  };
  const walk = (v: unknown, pagePath: string): void => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, pagePath));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.href === 'string' && typeof o.label === 'string') o.href = fix(o.href, pagePath);
      Object.values(o).forEach((x) => walk(x, pagePath));
    }
  };
  const out = structuredClone(config);
  for (const p of out.pages) walk(p.sections, p.path);
  return out;
}

/** A short line about the business: the owner's own words, else the home hero's subheading. */
function summaryLine(brief: Brief, extracted: Extracted | null, filled: Record<string, Section[]>): string {
  if (extracted?.tagline) return extracted.tagline;
  const hero = (filled.home ?? []).find((s) => s.type === 'hero');
  if (hero?.type === 'hero' && hero.content.subheading) return hero.content.subheading;
  return `${brief.businessType}${brief.client.address ? ` · ${brief.client.address}` : ''}`;
}

export function buildConfig(brief: Brief, extracted: Extracted | null, plan: Plan, filled: Record<string, Section[]>, assets: Asset[]): SiteConfig {
  const name = brief.businessName;
  const logo = assets.find((a) => a.kind === 'logo');
  const contactPage = plan.pages.find((p) => p.id === 'contact');
  const ctaHref = contactPage ? contactPage.path : '/#contact';
  const navLinks = plan.pages.filter((p) => p.path !== '/').map((p) => ({ label: p.title, href: p.path }));
  const wa = brief.client.whatsapp;
  const store = storeFor(brief, extracted);
  const shop = plan.pages.find((p) => p.id === 'shop');
  const bookings = bookingsFor(brief, extracted);
  const book = plan.pages.find((p) => p.id === 'book');

  const fixed = (pageId: string) => {
    const navbar: Section = {
      id: `${pageId}-navbar`,
      type: 'navbar',
      variant: brief.preset === 'luxe-minimal' || brief.preset === 'soft-studio' ? 'centered' : 'inline',
      content: {
        brand: name,
        ...(logo ? { logo: { src: logo.url, alt: `${name} logo` } } : {}),
        links: navLinks.slice(0, 6),
        cta:
          bookings && book
            ? { label: 'Book now', href: book.path }
            : store && shop
              ? { label: 'Shop now', href: shop.path }
              : { label: wa ? 'Message us' : 'Get in touch', href: ctaHref },
      },
    };
    const footer: Section = {
      id: `${pageId}-footer`,
      type: 'footer',
      variant: plan.pages.length > 2 ? 'columns' : 'simple',
      content: {
        brand: name,
        tagline: summaryLine(brief, extracted, filled).slice(0, 160),
        links: plan.pages.map((p) => ({ label: p.title, href: p.path })).slice(0, 8),
        instagram: brief.client.instagram,
        whatsapp: wa,
        note: `© ${new Date().getFullYear()} ${name}${brief.client.address ? ` · ${brief.client.address}` : ''}`,
      },
    };
    const float: Section[] = wa
      ? [
          {
            id: `${pageId}-whatsapp`,
            type: 'whatsapp-float',
            variant: 'pill',
            content: { number: wa, message: `Hi ${name}, I found you on your website.`, label: 'Chat on WhatsApp' },
          },
        ]
      : [];
    return { navbar, footer, float };
  };

  const config: SiteConfig = {
    schemaVersion: 1,
    meta: {
      businessName: name,
      description: summaryLine(brief, extracted, filled).slice(0, 300),
      language: 'en',
    },
    theme: siteTheme(brief),
    modules: { 'contact-form': true },
    ...(store ? { store } : {}),
    ...(bookings ? { bookings } : {}),
    pages: plan.pages.map((p) => {
      const { navbar, footer, float } = fixed(p.id);
      return { id: p.id, path: p.path, title: p.title, sections: [navbar, ...(filled[p.id] ?? []), footer, ...float] };
    }),
  };
  return siteConfigSchema.parse(fixLinks(config));
}

export function presetLabel(brief: Brief): string {
  return (brief.style?.name ?? PRESETS[brief.preset].name) + (brief.useBrand && brief.brandColors.length ? ' with logo colours' : '');
}

/** The site's theme: the chosen style (or preset), with logo colours on top when switched on. */
export function siteTheme(brief: Brief): SiteTheme {
  const brand = brandOverrides(brief);
  if (!brief.style) return themeFromPreset(brief.preset, { brand });
  const theme = structuredClone(brief.style.theme);
  Object.assign(theme.colors, brand);
  if (brand.primary) theme.colors.onPrimary = readableOn(theme.colors.primary, theme.colors.background, theme.colors.text);
  return theme;
}
