import { PRESETS } from '@/lib/presets';
import { siteConfigSchema, type Section, type SiteConfig } from '@/site/schema';
import { contrast, themeFromPreset } from '@/site/theme';
import type { Asset, Brief, Extracted, Plan } from './brief';

/**
 * Logo colours replace the preset's primary and accent, but only where they
 * stay readable: the primary also colours small text and buttons, so it needs
 * 3:1 against the background or it becomes the accent instead.
 */
export function brandOverrides(brief: Brief): { primary?: string; accent?: string } {
  if (!brief.useBrand || !brief.brandColors.length) return {};
  const base = themeFromPreset(brief.preset).colors;
  const readable = brief.brandColors.filter((c) => contrast(c, base.background) >= 3);
  const primary = readable[0];
  const accent = brief.brandColors.find((c) => c !== primary);
  return { ...(primary ? { primary } : {}), ...(accent ? { accent } : {}) };
}

export function buildConfig(brief: Brief, extracted: Extracted | null, plan: Plan, filled: Record<string, Section[]>, assets: Asset[]): SiteConfig {
  const name = brief.businessName;
  const logo = assets.find((a) => a.kind === 'logo');
  const contactPage = plan.pages.find((p) => p.id === 'contact');
  const ctaHref = contactPage ? contactPage.path : '/#contact';
  const navLinks = plan.pages.filter((p) => p.path !== '/').map((p) => ({ label: p.title, href: p.path }));
  const wa = brief.client.whatsapp;

  const fixed = (pageId: string) => {
    const navbar: Section = {
      id: `${pageId}-navbar`,
      type: 'navbar',
      variant: brief.preset === 'luxe-minimal' || brief.preset === 'soft-studio' ? 'centered' : 'inline',
      content: {
        brand: name,
        ...(logo ? { logo: { src: logo.url, alt: `${name} logo` } } : {}),
        links: navLinks.slice(0, 6),
        cta: { label: wa ? 'Message us' : 'Get in touch', href: ctaHref },
      },
    };
    const footer: Section = {
      id: `${pageId}-footer`,
      type: 'footer',
      variant: plan.pages.length > 2 ? 'columns' : 'simple',
      content: {
        brand: name,
        tagline: extracted?.tagline || `${brief.businessType}${brief.client.address ? ` · ${brief.client.address}` : ''}`,
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
      description: (extracted?.tagline || `${name}, ${brief.businessType.toLowerCase()}${brief.client.address ? ` at ${brief.client.address}` : ''}.`).slice(0, 300),
      language: 'en',
    },
    theme: themeFromPreset(brief.preset, { brand: brandOverrides(brief) }),
    modules: { 'contact-form': true },
    pages: plan.pages.map((p) => {
      const { navbar, footer, float } = fixed(p.id);
      return { id: p.id, path: p.path, title: p.title, sections: [navbar, ...(filled[p.id] ?? []), footer, ...float] };
    }),
  };
  return siteConfigSchema.parse(config);
}

export function presetLabel(brief: Brief): string {
  return PRESETS[brief.preset].name + (brief.useBrand && brief.brandColors.length ? ' with logo colours' : '');
}
