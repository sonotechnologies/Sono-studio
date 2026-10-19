import { describe, expect, it } from 'vitest';
import { applyOps, chatPrompt, chatReplyText } from '@/ai/chat';
import { KORA_KITCHEN } from '@/site/samples/kora-kitchen';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';
import {
  duplicateSection,
  findSection,
  getIn,
  moveSection,
  newSection,
  removeSection,
  revertChange,
  setField,
  setIn,
  setVariant,
  syncShared,
  toggleHidden,
  applyLayouts,
} from './model';

const site = (): SiteConfig => structuredClone(KORA_KITCHEN);
const heroOf = (c: SiteConfig) => findSection(c, 'home-hero')!.section;

describe('workspace model', () => {
  it('reads and writes nested paths without touching the original', () => {
    const o = { items: [{ title: 'a' }] };
    const n = setIn(o, 'items.0.title', 'b');
    expect(getIn(n, 'items.0.title')).toBe('b');
    expect(o.items[0].title).toBe('a');
    expect(setIn({}, 'list.0.name', 'x')).toEqual({ list: [{ name: 'x' }] });
    expect(setIn({ a: [1, 2, 3] }, 'a.1', undefined)).toEqual({ a: [1, 3] });
  });

  it('edits a field and refuses values the schema rejects', () => {
    const c = setField(site(), 'home-hero', 'heading', 'New headline');
    expect(heroOf(c).content).toMatchObject({ heading: 'New headline' });
    expect(() => setField(site(), 'home-hero', 'heading', 'x'.repeat(500))).toThrow();
    expect(() => setField(site(), 'home-hero', 'primaryCta.href', 'javascript:alert(1)')).toThrow();
  });

  it('changes variant, hides, moves, duplicates and removes', () => {
    let c = setVariant(site(), 'home-hero', 'centered');
    expect(heroOf(c).variant).toBe('centered');
    expect(() => setVariant(site(), 'home-hero', 'nope')).toThrow();
    c = toggleHidden(c, 'home-hero');
    expect(heroOf(c).hidden).toBe(true);
    c = moveSection(c, 'home-hero', 3);
    expect(findSection(c, 'home-hero')!.index).toBe(3);
    const d = duplicateSection(c, 'home-hero');
    expect(findSection(d.config, d.id)!.index).toBe(4);
    expect(siteConfigSchema.safeParse(d.config).success).toBe(true);
    expect(findSection(removeSection(d.config, d.id), d.id)).toBeNull();
  });

  it('creates a valid new section of every addable type', () => {
    for (const t of ['hero', 'about', 'features', 'gallery', 'testimonials', 'faq', 'cta', 'contact', 'stats'] as const) {
      const s = newSection(site(), t, 'home', 'Restaurant');
      expect(s.type).toBe(t);
    }
  });

  it('undoes one change while keeping later edits elsewhere', () => {
    const before = site();
    const after = applyOps(before, [{ op: 'update', section: 'home-hero', content: { heading: 'AI heading' } }, { op: 'remove', section: 'home-gallery' }], { kind: 'site' }).config;
    const later = setField(after, 'home-about', 'heading', 'My own edit');
    const undone = revertChange(later, before, after);
    expect(heroOf(undone).content).toMatchObject({ heading: (KORA_KITCHEN.pages[0].sections[1].content as { heading: string }).heading });
    expect(findSection(undone, 'home-gallery')).not.toBeNull();
    expect(findSection(undone, 'home-gallery')!.index).toBe(findSection(before, 'home-gallery')!.index);
    expect(findSection(undone, 'home-about')!.section.content).toMatchObject({ heading: 'My own edit' });
  });
});

describe('chat operations', () => {
  it('applies updates, adds and theme changes and keeps photos', () => {
    const base = setField(site(), 'home-hero', 'image', { src: '/mine.jpg', alt: 'mine' });
    const r = applyOps(
      base,
      [
        { op: 'update', section: 'home-hero', content: { heading: 'Warmer', image: { src: 'https://made.up/x.jpg', alt: 'x' } } },
        { op: 'add', page: 'home', after: 'home-hero', type: 'faq', variant: 'accordion', content: { heading: 'Q', intro: '', items: [{ question: 'a?', answer: 'b' }] } },
        { op: 'theme', colors: { primary: '#123456' } },
      ],
      { kind: 'site' },
    );
    expect(r.skipped).toEqual([]);
    expect(heroOf(r.config).content).toMatchObject({ heading: 'Warmer', image: { src: '/mine.jpg' } });
    const home = r.config.pages[0].sections.map((s) => s.type);
    expect(home.indexOf('faq')).toBe(home.indexOf('hero') + 1);
    expect(r.config.theme.colors.primary).toBe('#123456');
    expect(r.summary).toMatch(/Hero/);
  });

  it('respects scope and skips bad operations without failing the rest', () => {
    const r = applyOps(
      site(),
      [
        { op: 'update', section: 'home-about', content: { heading: 'Out of scope' } },
        { op: 'theme', colors: { primary: '#000000' } },
        { op: 'update', section: 'home-hero', content: { heading: 'In scope' } },
        { op: 'update', section: 'home-hero', variant: 'diagonal' },
        { op: 'remove', section: 'home-nav' },
      ],
      { kind: 'section', sectionId: 'home-hero' },
    );
    expect(heroOf(r.config).content).toMatchObject({ heading: 'In scope' });
    expect(r.skipped.length).toBe(4);
    expect(r.config.theme).toEqual(KORA_KITCHEN.theme);
  });

  it('never moves a section above the navbar or below the footer', () => {
    const r = applyOps(site(), [{ op: 'move', section: 'home-cta', after: null }], { kind: 'page', pageId: 'home' });
    expect(r.config.pages[0].sections[0].type).toBe('navbar');
    expect(r.config.pages[0].sections[1].id).toBe('home-cta');
    const r2 = applyOps(site(), [{ op: 'move', section: 'home-hero', after: 'home-whatsapp' }], { kind: 'page', pageId: 'home' });
    const ids = r2.config.pages[0].sections.map((s) => s.type);
    expect(ids.indexOf('hero')).toBeLessThan(ids.indexOf('footer'));
  });
});

describe('shared sections and merging', () => {
  it('copies a navbar or footer edit to every page', () => {
    const c = syncShared(setField(site(), 'home-footer', 'tagline', 'Open late on Fridays'), 'home-footer');
    for (const p of c.pages) expect((p.sections.find((s) => s.type === 'footer')!.content as { tagline: string }).tagline).toBe('Open late on Fridays');
    expect(syncShared(site(), 'home-hero')).toEqual(site());
  });

  it('chat edits to the footer reach every page', () => {
    const r = applyOps(site(), [{ op: 'update', section: 'home-footer', content: { tagline: 'New line' } }], { kind: 'site' });
    expect(findSection(r.config, 'menu-footer')!.section.content).toMatchObject({ tagline: 'New line' });
  });

  it('re-applies a chat change onto edits made while it was running', () => {
    const before = site();
    const after = applyOps(before, [{ op: 'update', section: 'home-hero', content: { heading: 'From the AI' } }], { kind: 'site' }).config;
    const meanwhile = setField(before, 'home-about', 'heading', 'Typed by hand');
    const merged = revertChange(meanwhile, after, before);
    expect((heroOf(merged).content as { heading: string }).heading).toBe('From the AI');
    expect((findSection(merged, 'home-about')!.section.content as { heading: string }).heading).toBe('Typed by hand');
  });
});

describe('honest chat replies', () => {
  it('reports settings a section does not have instead of silently dropping them', () => {
    const r = applyOps(site(), [{ op: 'update', section: 'home-hero', content: { glow: true } }], { kind: 'site' });
    expect(r.skipped[0]).toMatch(/hero section has no setting for that/);
    expect(r.config).toEqual(siteConfigSchema.parse(site()));
  });

  it('can make the navbar sticky on every page', () => {
    const r = applyOps(site(), [{ op: 'update', section: 'home-nav', content: { sticky: true } }], { kind: 'section', sectionId: 'home-nav' });
    expect(r.skipped).toEqual([]);
    for (const p of r.config.pages) expect((p.sections[0].content as { sticky?: boolean }).sticky).toBe(true);
  });

  it('never lets the reply claim a change that did not happen', () => {
    expect(chatReplyText('I made the header sticky.', 1, false, ['update: Hero has no setting "x"'])).toMatch(/^Nothing changed/);
    expect(chatReplyText('That needs a booking module.', 0, false, [])).toBe('That needs a booking module.');
    expect(chatReplyText('Done it.', 2, true, [])).toBe('Done it.');
    expect(chatReplyText('Done it.', 2, true, ['remove: the navbar and footer stay'])).toMatch(/couldn’t be applied: the navbar and footer stay/);
  });
});

describe('style layouts', () => {
  it('switches sections to the theme’s preferred layouts and leaves unknown ones alone', () => {
    const c = site();
    c.theme = { ...c.theme, layouts: { hero: 'full-bleed', navbar: 'centered', gallery: 'not-a-layout' } };
    const r = applyLayouts(c);
    expect(heroOf(r.config).variant).toBe('full-bleed');
    expect(r.config.pages.every((p) => p.sections[0].variant === 'centered')).toBe(true);
    expect(r.changed).toBe(1 + r.config.pages.length + (c.pages.flatMap((p) => p.sections).filter((s) => s.type === 'hero').length - 1));
    expect(applyLayouts(r.config).changed).toBe(0);
  });

  it('adds new sections in the style’s layout', () => {
    const c = site();
    c.theme = { ...c.theme, layouts: { faq: 'two-column' } };
    expect(newSection(c, 'faq', 'home', 'restaurant').variant).toBe('two-column');
  });
});

describe('chat replies in plain words', () => {
  it('turns out-of-reach changes into everyday explanations', () => {
    const fonts = applyOps(site(), [{ op: 'theme', fonts: { heading: 'Comic Sans' } }], { kind: 'site' });
    expect(fonts.skipped[0]).toMatch(/isn’t available; choose from/);
    const scoped = applyOps(site(), [{ op: 'theme', colors: { primary: '#112233' } }], { kind: 'section', sectionId: 'home-hero' });
    expect(scoped.skipped[0]).toMatch(/Whole site/);
    const missing = applyOps(site(), [{ op: 'remove', section: 'nope' }], { kind: 'site' });
    expect(missing.skipped[0]).not.toMatch(/"nope"/);
  });

  it('gives the model the conversation so far', () => {
    const p = chatPrompt(siteConfigSchema.parse(site()), { kind: 'site' }, 'yes, do that', 'Restaurant', [
      { role: 'assistant', text: 'Want me to make the cards full width on phones?' },
    ]);
    expect(p.prompt).toContain('You: Want me to make the cards full width on phones?');
  });
});

describe('what the chat knows about each section', () => {
  it('sees what each layout looks like and what each setting does', () => {
    const p = chatPrompt(siteConfigSchema.parse(site()), { kind: 'site' }, 'make the menu stay at the top', 'Restaurant');
    expect(p.prompt).toContain('"inline" (Logo left, links and button right)');
    expect(p.prompt).toContain('Keep the navbar at the top of the screen while scrolling');
  });
});
