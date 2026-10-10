import { demoContent } from '@/ai/demo';
import { EMPTY_EXTRACTED, type Brief } from '@/generate/brief';
import { SECTIONS } from '@/site/registry';
import { sectionSchema, siteConfigSchema, type Section, type SectionType, type SiteConfig, type SitePage } from '@/site/schema';
import { PREFERRED_VARIANTS } from '@/site/starter';

/*
 * Every workspace edit is a pure function from one config to the next, so
 * undo, redo, autosave and AI patches all work the same way.
 */

type Key = string | number;

export function parsePath(path: string): Key[] {
  return path
    .split('.')
    .filter(Boolean)
    .map((k) => (/^\d+$/.test(k) ? Number(k) : k));
}

export function getIn(obj: unknown, path: string | Key[]): unknown {
  const keys = typeof path === 'string' ? parsePath(path) : path;
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<Key, unknown>)[k];
  }
  return cur;
}

/** Returns a copy of `obj` with the value at `path` replaced (undefined removes it). */
export function setIn<T>(obj: T, path: string | Key[], value: unknown): T {
  const keys = typeof path === 'string' ? parsePath(path) : path;
  if (!keys.length) return value as T;
  const out = structuredClone(obj) as Record<Key, unknown>;
  let cur = out;
  keys.slice(0, -1).forEach((k, i) => {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = typeof keys[i + 1] === 'number' ? [] : {};
    cur = cur[k] as Record<Key, unknown>;
  });
  const last = keys.at(-1)!;
  if (value === undefined) {
    if (Array.isArray(cur) && typeof last === 'number') cur.splice(last, 1);
    else delete cur[last];
  } else cur[last] = value;
  return out as T;
}

export function findSection(config: SiteConfig, sectionId: string): { page: SitePage; index: number; section: Section } | null {
  for (const page of config.pages) {
    const index = page.sections.findIndex((s) => s.id === sectionId);
    if (index >= 0) return { page, index, section: page.sections[index] };
  }
  return null;
}

function mapPage(config: SiteConfig, pageId: string, fn: (sections: Section[]) => Section[]): SiteConfig {
  return { ...config, pages: config.pages.map((p) => (p.id === pageId ? { ...p, sections: fn(p.sections) } : p)) };
}

function mapSection(config: SiteConfig, sectionId: string, fn: (s: Section) => Section): SiteConfig {
  return { ...config, pages: config.pages.map((p) => ({ ...p, sections: p.sections.map((s) => (s.id === sectionId ? fn(s) : s)) })) };
}

/** Sets one field inside a section's content, e.g. "items.0.title". Rejects values the section schema refuses. */
export function setField(config: SiteConfig, sectionId: string, path: string, value: unknown): SiteConfig {
  return mapSection(config, sectionId, (s) => {
    const next = { ...s, content: setIn(s.content, path, value) } as Section;
    const check = sectionSchema.safeParse(next);
    if (!check.success) throw new Error(check.error.issues[0]?.message ?? 'That value is not allowed here');
    return check.data;
  });
}

export function setVariant(config: SiteConfig, sectionId: string, variant: string): SiteConfig {
  return mapSection(config, sectionId, (s) => sectionSchema.parse({ ...s, variant }));
}

export function toggleHidden(config: SiteConfig, sectionId: string): SiteConfig {
  return mapSection(config, sectionId, (s) => ({ ...s, hidden: s.hidden ? undefined : true }));
}

export function moveSection(config: SiteConfig, sectionId: string, toIndex: number): SiteConfig {
  const at = findSection(config, sectionId);
  if (!at) return config;
  return mapPage(config, at.page.id, (list) => {
    const to = Math.max(0, Math.min(list.length - 1, toIndex));
    if (to === at.index) return list;
    const arr = [...list];
    const [it] = arr.splice(at.index, 1);
    arr.splice(to, 0, it);
    return arr;
  });
}

export function removeSection(config: SiteConfig, sectionId: string): SiteConfig {
  return { ...config, pages: config.pages.map((p) => ({ ...p, sections: p.sections.filter((s) => s.id !== sectionId) })) };
}

export function uniqueSectionId(config: SiteConfig, base: string): string {
  const taken = new Set(config.pages.flatMap((p) => p.sections.map((s) => s.id)));
  const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'section';
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n++) if (!taken.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

export function duplicateSection(config: SiteConfig, sectionId: string): { config: SiteConfig; id: string } {
  const at = findSection(config, sectionId);
  if (!at) return { config, id: sectionId };
  const id = uniqueSectionId(config, `${sectionId}-copy`);
  return { config: insertSection(config, at.page.id, at.index + 1, { ...structuredClone(at.section), id }), id };
}

export function insertSection(config: SiteConfig, pageId: string, index: number, section: Section): SiteConfig {
  return mapPage(config, pageId, (list) => {
    const arr = [...list];
    arr.splice(Math.max(0, Math.min(arr.length, index)), 0, section);
    return arr;
  });
}

/** A new section with plain placeholder copy for this business, ready to edit or to hand to the AI. */
export function newSection(config: SiteConfig, type: SectionType, pageId: string, businessType: string): Section {
  const brief: Brief = {
    businessName: config.meta.businessName,
    businessType: businessType || 'business',
    preset: config.theme.preset,
    pages: ['home'],
    paste: '',
    client: { ownerName: '', whatsapp: '', instagram: '', address: '' },
    brandColors: [],
    useBrand: false,
  };
  const variant = (PREFERRED_VARIANTS[config.theme.preset][type] as string | undefined) ?? SECTIONS[type].variants[0].id;
  const page = config.pages.find((p) => p.id === pageId);
  return sectionSchema.parse({
    id: uniqueSectionId(config, `${pageId}-${type}`),
    type,
    variant,
    content: demoContent(type, brief, EMPTY_EXTRACTED, page?.title ?? 'Home'),
  });
}

/** Sections every page repeats. Editing one on any page edits it everywhere. */
export const SHARED_TYPES: SectionType[] = ['navbar', 'footer', 'whatsapp-float'];

export function syncShared(config: SiteConfig, sectionId: string): SiteConfig {
  const at = findSection(config, sectionId);
  if (!at || !SHARED_TYPES.includes(at.section.type)) return config;
  const { type, variant, content, hidden } = at.section;
  return {
    ...config,
    pages: config.pages.map((p) => ({
      ...p,
      sections: p.sections.map((s) => (s.type === type && s.id !== sectionId ? ({ ...s, variant, content: structuredClone(content), hidden } as Section) : s)),
    })),
  };
}

/** "Hero · Quiet space for modern rest." for lists and labels. */
export function sectionLabel(s: Section): { name: string; detail: string } {
  const c = s.content as Record<string, unknown>;
  const text = [c.heading, c.brand, c.label, c.eyebrow].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return { name: SECTIONS[s.type].label, detail: s.hidden ? 'Hidden' : text ?? SECTIONS[s.type].variants.find((v) => v.id === s.variant)?.label ?? '' };
}

/**
 * Undoes one change (for example an AI edit) without throwing away later edits
 * to other sections: sections the change touched go back to how they were,
 * including ones it removed or added.
 */
export function revertChange(current: SiteConfig, before: SiteConfig, after: SiteConfig): SiteConfig {
  let out = current;
  const sectionsOf = (c: SiteConfig) => new Map(c.pages.flatMap((p) => p.sections.map((s) => [s.id, JSON.stringify(s)] as const)));
  const b = sectionsOf(before);
  const a = sectionsOf(after);
  const touched = new Set([...b.keys(), ...a.keys()].filter((id) => b.get(id) !== a.get(id)));
  for (const id of touched) {
    const was = findSection(before, id);
    const now = findSection(out, id);
    if (!was && now) out = removeSection(out, id);
    else if (was && now) out = mapSection(out, id, () => was.section);
    else if (was && !now && out.pages.some((p) => p.id === was.page.id)) out = insertSection(out, was.page.id, was.index, was.section);
  }
  // Section order on a page the change reordered.
  for (const pb of before.pages) {
    const pa = after.pages.find((p) => p.id === pb.id);
    const pc = out.pages.find((p) => p.id === pb.id);
    if (!pa || !pc) continue;
    const order = (p: SitePage) => p.sections.map((s) => s.id).join(',');
    if (order(pb) !== order(pa) && order(pc) === order(pa)) out = mapPage(out, pb.id, () => pb.sections);
  }
  if (JSON.stringify(before.theme) !== JSON.stringify(after.theme) && JSON.stringify(out.theme) === JSON.stringify(after.theme)) {
    out = { ...out, theme: before.theme };
  }
  return siteConfigSchema.parse(out);
}
