import { describe, expect, it } from 'vitest';
import { devSeed } from '@/lib/data/dev-seed';
import { PRESET_IDS } from '@/lib/types';
import { SECTIONS } from './registry';
import { KORA_KITCHEN } from './samples/kora-kitchen';
import { sectionSchema, siteConfigSchema } from './schema';
import { starterConfig } from './starter';
import { contrast, themeFromPreset } from './theme';

describe('site config schema', () => {
  it('accepts the hand-written Kora Kitchen site', () => {
    const r = siteConfigSchema.safeParse(KORA_KITCHEN);
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it('accepts a starter site for every sample project and preset', () => {
    for (const project of devSeed()) {
      for (const preset of PRESET_IDS) {
        const r = siteConfigSchema.safeParse(starterConfig({ ...project, preset }));
        expect(r.success ? [] : r.error.issues, `${project.name} / ${preset}`).toEqual([]);
      }
    }
  });

  it('accepts a starter for a project with no client details', () => {
    const r = siteConfigSchema.safeParse(
      starterConfig({ name: 'X', businessType: '', headline: '', preset: 'tech-dark', client: { ownerName: '', whatsapp: '', instagram: '', address: '', notes: '' } }),
    );
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it('rejects unknown variants, bad links and duplicate ids', () => {
    expect(sectionSchema.safeParse({ id: 'a', type: 'hero', variant: 'diagonal', content: {} }).success).toBe(false);
    const badLink = structuredClone(KORA_KITCHEN);
    const nav = badLink.pages[0].sections[0];
    if (nav.type === 'navbar') nav.content.links[0].href = 'javascript:alert(1)';
    expect(siteConfigSchema.safeParse(badLink).success).toBe(false);
    const dup = structuredClone(KORA_KITCHEN);
    dup.pages[1].sections[0].id = 'home-nav';
    expect(siteConfigSchema.safeParse(dup).success).toBe(false);
    const noHome = structuredClone(KORA_KITCHEN);
    noHome.pages = noHome.pages.slice(1);
    expect(siteConfigSchema.safeParse(noHome).success).toBe(false);
  });

  it('uses only variants the registry knows about', () => {
    for (const page of KORA_KITCHEN.pages)
      for (const s of page.sections)
        expect(SECTIONS[s.type].variants.map((v) => v.id), s.id).toContain(s.variant);
  });
});

describe('theme', () => {
  it('builds a valid theme for every preset with readable button text', () => {
    for (const preset of PRESET_IDS) {
      const t = themeFromPreset(preset);
      expect(contrast(t.colors.primary, t.colors.onPrimary), preset).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to the mode a preset has', () => {
    expect(themeFromPreset('tech-dark', { mode: 'light' }).mode).toBe('dark');
    expect(themeFromPreset('luxe-minimal', { mode: 'dark' }).mode).toBe('dark');
  });

  it('lets brand colours replace preset colours', () => {
    const t = themeFromPreset('warm-table', { brand: { primary: '#123456' } });
    expect(t.colors.primary).toBe('#123456');
    expect(t.fonts.heading).toBe('Fraunces');
  });
});

describe('page headings', () => {
  it('gives every page one main heading, from the hero or else the first section', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { SitePageView } = await import('./render');
    const config = siteConfigSchema.parse(KORA_KITCHEN);
    for (const page of config.pages) {
      const html = renderToStaticMarkup(createElement(SitePageView, { config, page, ctx: { link: (h: string) => h, editable: false } }));
      expect((html.match(/<h1[\s>]/g) ?? []).length, page.path).toBe(1);
    }
  });
});

describe('starter text', () => {
  it('finds the starter template’s placeholders, and none on a finished site', async () => {
    const { starterTexts } = await import('@/export/checklist');
    const starter = starterConfig({ name: 'Studio Nala', businessType: 'Salon', headline: '', preset: 'soft-studio', client: { ownerName: '', whatsapp: '', instagram: '', address: '', notes: '' } });
    expect(starterTexts(starter).length).toBeGreaterThan(3);
    expect(starterTexts(siteConfigSchema.parse(KORA_KITCHEN))).toEqual([]);
  });
});
