import { z } from 'zod';
import { contentSchemaFor } from '@/generate/fill';
import { addableTypes, BOOKING_TYPES, PLANNABLE_TYPES, STORE_TYPES } from '@/generate/plan';
import { GOOGLE_FONTS } from '@/site/fonts';
import { SECTIONS } from '@/site/registry';
import { customDataSchema, sectionSchema, siteConfigSchema, themeSchema, type Section, type SectionType, type SiteConfig } from '@/site/schema';
import { readableOn } from '@/site/theme';
import { findSection, insertSection, moveSection, removeSection, syncShared, uniqueSectionId } from '@/workspace/model';

/*
 * Chat edits come back as a short list of operations on the config, never a
 * rewritten site: small requests are cheap on free models, every change is
 * validated before it lands, and each one can be undone.
 */

export type ChatScope = { kind: 'site' } | { kind: 'page'; pageId: string } | { kind: 'section'; sectionId: string };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update'), section: z.string(), variant: z.string().nullish(), content: z.record(z.string(), z.unknown()).nullish() }),
  z.object({ op: z.literal('add'), page: z.string(), after: z.string().nullish(), type: z.string(), variant: z.string().nullish(), content: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('remove'), section: z.string() }),
  z.object({ op: z.literal('move'), section: z.string(), after: z.string().nullish() }),
  z.object({
    op: z.literal('theme'),
    colors: z.object({ background: hex, surface: hex, text: hex, muted: hex, primary: hex, accent: hex }).partial().optional(),
    fonts: z.object({ heading: z.string(), body: z.string() }).partial().optional(),
    radius: z.object({ card: z.number(), button: z.number(), input: z.number() }).partial().optional(),
  }),
]);
export type ChatOp = z.infer<typeof opSchema>;

/**
 * A reply is read leniently: an over-long reply is cut, and an operation the
 * model wrote wrongly is counted and left out instead of failing the rest.
 */
export const chatReplySchema = z
  .object({
    reply: z.string().catch(''),
    ops: z.array(z.unknown()).catch([]),
  })
  .transform(({ reply, ops }) => {
    const read = ops.slice(0, 20).map((o) => opSchema.safeParse(o));
    return {
      reply: reply.trim().slice(0, 600),
      ops: read.flatMap((r) => (r.success ? [r.data] : [])),
      unreadable: read.filter((r) => !r.success).length,
    };
  });
export type ChatReply = z.infer<typeof chatReplySchema>;

function schemaText(type: SectionType): string {
  const s = z.toJSONSchema(contentSchemaFor(type), { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete s.$schema;
  return JSON.stringify(s);
}

const FONTS = Object.keys(GOOGLE_FONTS);

/** Stored as a chat message's change when the turn failed, so it isn't fed back to the model. */
export const CHAT_ERROR = 'Not done';

/** Whether a request may add a section, so the content schemas of the sections that could be added are worth sending. */
const ADDING = /\b(add|adding|new|insert|include|put|create|another|more|extra|section|block|faq|gallery|testimonials?|reviews?|map|menu|pricing|team|form|banner)\b/i;

export function chatPrompt(config: SiteConfig, scope: ChatScope, message: string, businessType: string, history: { role: 'user' | 'assistant'; text: string }[] = []) {
  const page = scope.kind === 'page' ? config.pages.find((p) => p.id === scope.pageId) : null;
  const target = scope.kind === 'section' ? findSection(config, scope.sectionId) : null;
  const inScope: Section[] = target ? [target.section] : page ? page.sections : config.pages.flatMap((p) => p.sections);
  const owned = [...new Set(inScope.map((s) => s.type))];
  // Sections that could be added: their full schemas only when the request may be about adding one (they're long).
  const addable = scope.kind === 'section' ? [] : addableTypes(config).filter((t) => !owned.includes(t));
  const withSchemas = ADDING.test(message) || history.some((h) => h.role === 'user' && ADDING.test(h.text)) ? addable : [];
  const types = [...owned.filter((t) => t !== 'custom'), ...withSchemas];
  // AI-written sections each have their own fields: the model sees them, and changes only the words in "data".
  const customs = inScope.flatMap((s) => {
    const def = s.type === 'custom' ? config.customSections?.[s.content.component] : undefined;
    if (!def) return [];
    const fields = z.toJSONSchema(customDataSchema(def.fields), { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete fields.$schema;
    return [`- "${s.id}" (${def.name}, written by AI: ${def.purpose}). Change its words with {"op":"update","section":"${s.id}","content":{"data":{<only the fields that change>}}}. Its layout and code can't change here; for that, the owner rewrites it from the Edit tab. Data schema: ${JSON.stringify(fields)}`];
  });
  const outline = config.pages.map((p) => `- page "${p.id}" (${p.path}, "${p.title}"): ${p.sections.map((s) => `${s.id} [${s.type}/${s.variant}]`).join(', ')}`).join('\n');

  return {
    system: [
      'You edit small-business websites made of fixed section types. You reply with a single JSON object and nothing else.',
      'Make only the change asked for, as a few small operations. Keep everything else exactly as it is.',
      'Never invent facts about the business (prices, amenities, hours, addresses, reviews, numbers). If the request needs facts you do not have, make the change with neutral wording and say in the reply what the owner should confirm.',
      'Image src values must stay as they are or be "" (empty). Never write image URLs.',
      'Only use fields that exist in the content schemas below. If the request needs something the site cannot do, return no operations and say plainly in the reply that it is not possible yet. Never say you changed something unless an operation does it.',
      'Write replies for a business owner, not a developer: never mention schemas, fields, JSON, operations, section ids or code. When something is not possible, say so in everyday words and suggest the closest thing that is: another layout of the same section, one of its settings, a theme change, or for a design the sections can’t do, a section written by AI from “+ → Custom section · written by AI”.',
      'For layout requests (width, columns, size, alignment, order), first look for a variant or a setting in the schema that does it, and use it.',
      'Short follow-ups ("yes", "do that", "but bigger") continue the conversation so far: work out the full request from it.',
    ].join(' '),
    prompt: `Business: ${config.meta.businessName} (${businessType || 'local business'}).
${history.length ? `Conversation so far:\n${history.slice(-6).map((h) => `${h.role === 'user' ? 'Owner' : 'You'}: ${h.text.slice(0, 400)}`).join('\n')}\n` : ''}Change requested: """${message.slice(0, 1500)}"""

Scope: ${scope.kind === 'site' ? 'the whole site' : scope.kind === 'page' ? `the "${page?.title}" page only` : `only the section "${target?.section.id}"`}. Do not touch sections outside it. Colours, fonts and corners (the theme) are shared by the whole site: change them only when the request is about them.

Site outline:
${outline}

Current content of the sections in scope (JSON):
${JSON.stringify(inScope.map((s) => ({ id: s.id, type: s.type, variant: s.variant, content: s.content })))}

${customs.length ? `Sections written by AI:\n${customs.join('\n')}\n\n` : ''}Section types and variants you may use:
${types.map((t) => `- ${t}: layouts ${SECTIONS[t].variants.map((v) => `"${v.id}"${v.note ? ` (${v.note})` : ''}`).join(', ')}. Content schema: ${schemaText(t)}`).join('\n')}${
      addable.length > withSchemas.length ? `\nOther sections that can be added (ask the owner to say "add a … section" to get one): ${addable.filter((t) => !withSchemas.includes(t)).join(', ')}.` : ''
    }

Operations (use as few as possible):
- {"op":"update","section":"<id>","content":{<only the fields that change>},"variant":"<optional new variant>"}  Fields you give replace the old ones. A list is replaced whole: give every item, changed or not, or the missing ones are deleted.
- {"op":"add","page":"<page id>","after":"<id of a section on that page, or null for the top>","type":"<type>","variant":"<variant>","content":{<full content>}}
- {"op":"remove","section":"<id>"}
- {"op":"move","section":"<id>","after":"<section id or null for the top>"}
- {"op":"theme","colors":{...},"fonts":{"heading":"...","body":"..."},"radius":{"card":0,"button":0,"input":0}}  Colours are #RRGGBB. Fonts (only these): ${FONTS.join(', ')}.

Reply with JSON in exactly this shape:
{"reply":"<one or two sentences to the owner about what changed>","ops":[ ... ]}`,
  };
}

export interface ApplyResult {
  config: SiteConfig;
  /** Section ids that changed, for the edit flash. */
  touched: string[];
  /** Short label for the change pill, e.g. "Hero, FAQ" or "Theme". */
  summary: string;
  skipped: string[];
}

function inScope(config: SiteConfig, scope: ChatScope, sectionId: string): boolean {
  if (scope.kind === 'site') return true;
  if (scope.kind === 'section') return sectionId === scope.sectionId;
  return findSection(config, sectionId)?.page.id === scope.pageId;
}

const OUTSIDE = 'that’s outside what you picked under “Will change”';

/** Applies what it can; anything invalid or out of scope is skipped and reported. */
export function applyOps(config: SiteConfig, ops: ChatOp[], scope: ChatScope): ApplyResult {
  let out = structuredClone(config);
  const touched = new Set<string>();
  const skipped: string[] = [];
  const labels = new Set<string>();

  for (const op of ops) {
    const start = out;
    const marks = { touched: new Set(touched), labels: new Set(labels) };
    try {
      if (op.op === 'update') {
        const at = findSection(out, op.section);
        if (!at) throw new Error('that section isn’t on the site');
        if (!inScope(out, scope, op.section)) throw new Error(OUTSIDE);
        const prev = at.section;
        const known = Object.keys((contentSchemaFor(prev.type) as z.ZodObject).shape);
        const unknown = Object.keys(op.content ?? {}).filter((k) => !known.includes(k));
        if (unknown.length) throw new Error(`the ${SECTIONS[prev.type].label.toLowerCase()} section has no setting for that`);
        if (prev.type === 'custom' && (op.variant || (op.content?.component !== undefined && op.content.component !== prev.content.component)))
          throw new Error('a section written by AI keeps its design here; rewrite it from the Edit tab to change that');
        const content =
          prev.type === 'custom'
            ? // Only the fields given change: the rest of the section's words stay.
              { ...prev.content, data: { ...prev.content.data, ...((op.content?.data as Record<string, unknown> | undefined) ?? {}) } }
            : { ...(prev.content as Record<string, unknown>), ...(op.content ?? {}) };
        restoreImages(prev.content, content);
        const next = sectionSchema.parse({ ...prev, variant: op.variant ?? prev.variant, content });
        out = { ...out, pages: out.pages.map((p) => ({ ...p, sections: p.sections.map((s) => (s.id === op.section ? next : s)) })) };
        out = syncShared(out, op.section);
        touched.add(op.section);
        labels.add(SECTIONS[next.type].label);
      } else if (op.op === 'add') {
        if (scope.kind === 'section') throw new Error('to add a section, pick a page or “Whole site” under “Will change”');
        const page = out.pages.find((p) => p.id === op.page);
        if (!page) throw new Error('that page isn’t on the site');
        if (scope.kind === 'page' && scope.pageId !== page.id) throw new Error(OUTSIDE);
        if (!PLANNABLE_TYPES.includes(op.type as SectionType)) throw new Error('that kind of section can’t be added here');
        if (STORE_TYPES.includes(op.type as SectionType) && !out.store) throw new Error('product sections need a shop: add one in the Products tab');
        if (BOOKING_TYPES.includes(op.type as SectionType) && !out.bookings) throw new Error('the booking section needs bookings set up: add them in the Bookings tab');
        const type = op.type as SectionType;
        const variants = SECTIONS[type].variants.map((v) => v.id as string);
        const content = { ...op.content };
        restoreImages(undefined, content);
        const section = sectionSchema.parse({ id: uniqueSectionId(out, `${page.id}-${type}`), type, variant: variants.includes(op.variant ?? '') ? op.variant : variants[0], content });
        const index = placeAt(page.sections, op.after);
        out = insertSection(out, page.id, index, section);
        touched.add(section.id);
        labels.add(`added ${SECTIONS[type].label}`);
      } else if (op.op === 'remove') {
        const at = findSection(out, op.section);
        if (!at) throw new Error('that section isn’t on the site');
        if (scope.kind === 'section') throw new Error('to remove a section, pick its page or “Whole site” under “Will change”');
        if (!inScope(out, scope, op.section)) throw new Error(OUTSIDE);
        if (at.section.type === 'navbar' || at.section.type === 'footer') throw new Error('the navbar and footer stay');
        out = removeSection(out, op.section);
        labels.add(`removed ${SECTIONS[at.section.type].label}`);
      } else if (op.op === 'move') {
        const at = findSection(out, op.section);
        if (!at) throw new Error('that section isn’t on the site');
        if (!inScope(out, scope, op.section)) throw new Error(OUTSIDE);
        // Positions are counted with the moved section taken out; never above the navbar or below the footer.
        if (op.after && !at.page.sections.some((s) => s.id === op.after)) throw new Error('it was asked to go next to a section that isn’t on that page');
        out = moveSection(out, op.section, placeAt(at.page.sections.filter((s) => s.id !== op.section), op.after));
        touched.add(op.section);
        labels.add('order');
      } else {
        const font = [op.fonts?.heading, op.fonts?.body].find((f) => f && !FONTS.includes(f));
        if (font) throw new Error(`the font “${font}” isn’t available; choose from ${FONTS.join(', ')}`);
        const colors = { ...out.theme.colors, ...op.colors };
        colors.onPrimary = readableOn(colors.primary, colors.background, colors.text);
        out = { ...out, theme: themeSchema.parse({ ...out.theme, colors, fonts: { ...out.theme.fonts, ...op.fonts }, radius: { ...out.theme.radius, ...op.radius } }) };
        labels.add('Theme');
      }
      // Each change has to leave a valid site, or it's taken back on its own.
      out = siteConfigSchema.parse(out);
    } catch (err) {
      out = start;
      touched.clear();
      marks.touched.forEach((t) => touched.add(t));
      labels.clear();
      marks.labels.forEach((l) => labels.add(l));
      // Content that fails its checks: say which part, in words (the model wrote something too long or the wrong kind).
      skipped.push(`${op.op}: ${err instanceof z.ZodError ? zodWhy(err) : (err as Error).message}`);
    }
  }
  return { config: labels.size ? out : config, touched: [...touched], summary: [...labels].slice(0, 4).join(', ') || 'No change', skipped };
}

/**
 * Where a new or moved section goes: after the one named, or at the top
 * (just below the navbar), and never below the footer. An "after" that isn't
 * on the page puts it at the end, above the footer.
 */
function placeAt(sections: Section[], after: string | null | undefined): number {
  const navbar = sections.findIndex((s) => s.type === 'navbar');
  const footer = sections.findIndex((s) => s.type === 'footer');
  const end = footer >= 0 ? footer : sections.length;
  const named = after ? sections.findIndex((s) => s.id === after) : -1;
  const index = after ? (named >= 0 ? named + 1 : end) : navbar + 1;
  return Math.min(Math.max(index, navbar + 1), end);
}

/**
 * Keeps existing photos when the model rewrites a field, and blanks any URL it
 * made up. A photo the section already has stays with the item the model put
 * it on (items can be reordered); a new item takes the photo that was in its place.
 */
function restoreImages(prev: unknown, next: Record<string, unknown>): void {
  const known = new Map<string, { src: string; credit?: string }>();
  const collect = (a: unknown): void => {
    if (Array.isArray(a)) a.forEach(collect);
    else if (a && typeof a === 'object') {
      const o = a as Record<string, unknown>;
      if (typeof o.src === 'string' && o.src) known.set(o.src, { src: o.src, credit: typeof o.credit === 'string' ? o.credit : undefined });
      Object.values(o).forEach(collect);
    }
  };
  collect(prev);
  const walk = (a: unknown, b: unknown): void => {
    if (Array.isArray(b)) b.forEach((x, i) => walk(Array.isArray(a) ? a[i] : undefined, x));
    else if (b && typeof b === 'object') {
      const o = b as Record<string, unknown>;
      if (typeof o.src === 'string' && typeof o.alt === 'string') {
        const old = known.get(o.src) ?? (a as { src?: string; credit?: string } | undefined);
        o.src = old?.src ?? '';
        if (old?.credit) o.credit = old.credit;
        return;
      }
      for (const k of Object.keys(o)) walk(a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined, o[k]);
    }
  };
  walk(prev, next);
}

/**
 * The model's reply, unless it would claim a change that didn't happen. Then
 * the owner is told plainly what was not applied.
 */
export function chatReplyText(reply: string, opCount: number, changed: boolean, skipped: string[]): string {
  const why = skipped.length ? ` ${skipped.slice(0, 2).map((s) => s.replace(/^\w+: /, '')).join('; ')}.` : '';
  if (!changed && opCount > 0) return skipped.length ? `Nothing changed:${why}` : 'Nothing changed: that isn’t something the site can do yet.';
  if (!changed) return reply || 'Nothing changed.';
  const note = skipped.length ? ` Part of it couldn’t be applied:${why}` : '';
  return (reply || 'Done.') + note;
}

function zodWhy(err: z.ZodError): string {
  const i = err.issues[0];
  if (!i) return 'the change didn’t fit the section';
  const where = i.path.filter((p) => typeof p === 'string').at(-1);
  const what = i.code === 'too_big' ? 'was too long' : i.code === 'too_small' ? 'was empty or too short' : 'wasn’t the right kind of value';
  return `${where ? `the “${String(where)}” part` : 'part of it'} ${what}`;
}
