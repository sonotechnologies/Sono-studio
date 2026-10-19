import { parse } from 'parse5';
import { z } from 'zod';

/*
 * Editing an exact copy without touching its layout. Each page's words,
 * pictures and links are found by their place in the page (the 5th piece of
 * text, the 2nd image), and an edit replaces just those characters in the
 * original HTML, so everything else stays byte for byte as copied. Each edit
 * remembers what it replaced: if the copy is made again and that spot now
 * says something else, the edit is left out rather than put in the wrong place.
 */

export const copyEditSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    /** A page's file ("about.html"), or "*" for every place the same text appears. */
    page: z.string().max(200),
    index: z.number().int().min(0),
    from: z.string().max(5000),
    to: z.string().max(5000),
  }),
  z.object({ kind: z.literal('image'), page: z.string().max(200), index: z.number().int().min(0), from: z.string().max(2000), src: z.string().max(2000).optional(), alt: z.string().max(500).optional() }),
  z.object({ kind: z.literal('link'), page: z.string().max(200), index: z.number().int().min(0), from: z.string().max(2000), href: z.string().max(2000) }),
]);
export type CopyEdit = z.infer<typeof copyEditSchema>;
export const copyEditsSchema = z.array(copyEditSchema).max(5000);

type Loc = { startOffset: number; endOffset: number };
type ElLoc = Loc & { startTag?: Loc & { attrs?: Record<string, Loc> } };
type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  sourceCodeLocation?: ElLoc | null;
};

/** Text that isn't page content: code, styles, form values. */
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'iframe', 'object', 'head', 'title']);

/** How a text is shown and compared: its words, with spacing tidied. */
export const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface TextSpot {
  index: number;
  value: string;
  loc: Loc;
  /** The element holding it, which carries the marker in edit mode. */
  parent: Node;
}
export interface ImageSpot {
  index: number;
  node: Node;
  src: string;
  alt: string;
  /** <source> siblings in a <picture>, which would win over a new src. */
  sources: Node[];
}
export interface LinkSpot {
  index: number;
  node: Node;
  href: string;
}

export interface Spots {
  texts: TextSpot[];
  images: ImageSpot[];
  links: LinkSpot[];
}

const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;

/** The words, pictures and links in a page's body, in order, with where each sits in the HTML. */
export function findSpots(html: string): Spots {
  const doc = parse(html, { sourceCodeLocationInfo: true }) as unknown as Node;
  const spots: Spots = { texts: [], images: [], links: [] };
  const walk = (n: Node, picture: Node | null) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeName === '#text') {
        if (c.value && c.value.trim() && c.sourceCodeLocation && n.sourceCodeLocation?.startTag)
          spots.texts.push({ index: spots.texts.length, value: c.value, loc: c.sourceCodeLocation, parent: n });
        continue;
      }
      if (!c.tagName || SKIP.has(c.tagName)) continue;
      const located = c.sourceCodeLocation?.startTag;
      if (c.tagName === 'img' && located) {
        const sources = picture ? (picture.childNodes ?? []).filter((s) => s.tagName === 'source' && s.sourceCodeLocation) : [];
        spots.images.push({ index: spots.images.length, node: c, src: attr(c, 'src') ?? attr(c, 'data-src') ?? '', alt: attr(c, 'alt') ?? '', sources });
      }
      if (c.tagName === 'a' && located && attr(c, 'href') !== undefined) spots.links.push({ index: spots.links.length, node: c, href: attr(c, 'href')! });
      walk(c, c.tagName === 'picture' ? c : picture);
    }
  };
  const html_ = doc.childNodes?.find((c) => c.tagName === 'html');
  const body = html_?.childNodes?.find((c) => c.tagName === 'body');
  if (body) walk(body, null);
  return spots;
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Links that are safe to put in a page: web, email, phone, on-page and relative ones. */
export function safeHref(href: string): string | null {
  // Browsers ignore tabs, newlines and other control characters in a scheme ("java\tscript:").
  const h = href.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!h) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) && !/^(https?|mailto|tel|sms|whatsapp):/i.test(h)) return null;
  return h;
}

/** Image addresses an edit may use: web addresses and the copy's own files. */
export function safeSrc(src: string): string | null {
  const s = src.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:/i.test(s)) return null;
  return s;
}

type Splice = { start: number; end: number; text: string };

/** The edits that apply to one page, in the order they were made (a later one wins). */
function editsFor(page: string, edits: CopyEdit[]): CopyEdit[] {
  return edits.filter((e) => e.page === page || (e.page === '*' && e.kind === 'text'));
}

export interface ApplyOptions {
  /** Edit mode: marks each editable spot so the studio's editor can find it. */
  mark?: boolean;
  /** Rewrites an image address an edit puts in (for the export, which bundles the file). */
  mapSrc?: (src: string) => string;
}

export interface Applied {
  html: string;
  /** Edits whose spot no longer says what they replaced (the copy was made again). */
  skipped: CopyEdit[];
}

/** A page's HTML with its edits put in; everything else stays exactly as copied. */
export function applyEdits(page: string, html: string, edits: CopyEdit[], opts: ApplyOptions = {}): Applied {
  const mine = editsFor(page, edits);
  if (!mine.length && !opts.mark) return { html, skipped: [] };
  const spots = findSpots(html);
  const splices: Splice[] = [];
  const skipped: CopyEdit[] = [];
  const latest = new Map<string, CopyEdit>();
  for (const e of mine) {
    if (e.page === '*' && e.kind === 'text') {
      // Every text on the page that says the same thing, unless this page has its own edit for that spot.
      for (const t of spots.texts) if (tidy(t.value) === tidy(e.from) && !mine.some((x) => x.page === page && x.kind === 'text' && x.index === t.index)) latest.set(`text:${t.index}`, { ...e, index: t.index });
      continue;
    }
    latest.set(`${e.kind}:${e.index}`, e);
  }

  for (const e of latest.values()) {
    if (e.kind === 'text') {
      const t = spots.texts[e.index];
      if (!t || tidy(t.value) !== tidy(e.from)) {
        skipped.push(e);
        continue;
      }
      // Keep the spacing around the words, which can matter between inline elements.
      const lead = /^\s*/.exec(t.value)![0];
      const trail = /\s*$/.exec(t.value)![0];
      splices.push({ start: t.loc.startOffset, end: t.loc.endOffset, text: escText(`${lead}${e.to.trim() || '\u200b'}${trail}`) });
    } else if (e.kind === 'image') {
      const img = spots.images[e.index];
      if (!img || img.src !== e.from) {
        skipped.push(e);
        continue;
      }
      const tag = img.node.sourceCodeLocation!.startTag!;
      const attrs = tag.attrs ?? {};
      const src = e.src ? safeSrc(e.src) : null;
      if (src) {
        const value = opts.mapSrc ? opts.mapSrc(src) : src;
        // Lazy-loading scripts copy data-src into src later: point them at the new picture too.
        for (const name of ['src', 'data-src', 'data-lazy-src', 'data-original']) {
          if (attrs[name]) splices.push({ start: attrs[name].startOffset, end: attrs[name].endOffset, text: `${name}="${escAttr(value)}"` });
        }
        if (!attrs.src) splices.push({ start: insertAt(html, tag), end: insertAt(html, tag), text: ` src="${escAttr(value)}"` });
        // Other sizes of the old picture would be chosen over the new one.
        for (const name of ['srcset', 'data-srcset', 'sizes']) if (attrs[name]) splices.push({ start: attrs[name].startOffset, end: attrs[name].endOffset, text: '' });
        for (const s of img.sources) splices.push({ start: s.sourceCodeLocation!.startOffset, end: s.sourceCodeLocation!.endOffset, text: '' });
      }
      if (e.alt !== undefined) {
        if (attrs.alt) splices.push({ start: attrs.alt.startOffset, end: attrs.alt.endOffset, text: `alt="${escAttr(e.alt)}"` });
        else splices.push({ start: insertAt(html, tag), end: insertAt(html, tag), text: ` alt="${escAttr(e.alt)}"` });
      }
    } else {
      const a = spots.links[e.index];
      const href = safeHref(e.href);
      if (!a || a.href !== e.from || !href) {
        skipped.push(e);
        continue;
      }
      const loc = a.node.sourceCodeLocation!.startTag!.attrs!.href;
      splices.push({ start: loc.startOffset, end: loc.endOffset, text: `href="${escAttr(href)}"` });
    }
  }

  if (opts.mark) {
    const byParent = new Map<Node, number[]>();
    for (const t of spots.texts) byParent.set(t.parent, [...(byParent.get(t.parent) ?? []), t.index]);
    for (const [el, list] of byParent) {
      const tag = el.sourceCodeLocation!.startTag!;
      splices.push({ start: insertAt(html, tag), end: insertAt(html, tag), text: ` data-sono-t="${list.join(' ')}"` });
    }
    for (const i of spots.images) {
      const tag = i.node.sourceCodeLocation!.startTag!;
      splices.push({ start: insertAt(html, tag), end: insertAt(html, tag), text: ` data-sono-img="${i.index}"` });
    }
    for (const l of spots.links) {
      const tag = l.node.sourceCodeLocation!.startTag!;
      splices.push({ start: insertAt(html, tag), end: insertAt(html, tag), text: ` data-sono-a="${l.index}"` });
    }
  }
  return { html: splice(html, splices), skipped };
}

/** Just after the tag's name: "<img| src=…>". */
function insertAt(html: string, tag: Loc): number {
  const m = /^<[^\s/>]+/.exec(html.slice(tag.startOffset, tag.endOffset));
  return tag.startOffset + (m ? m[0].length : 1);
}

function splice(html: string, list: Splice[]): string {
  // Removals of a whole <source> can contain nothing else we change; drop anything nested in one to be safe.
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const kept: Splice[] = [];
  for (const s of sorted) {
    const prev = kept.at(-1);
    if (prev && s.start < prev.end && !(s.start === s.end && prev.start === prev.end)) continue;
    kept.push(s);
  }
  let out = '';
  let at = 0;
  for (const s of kept) {
    out += html.slice(at, s.start) + s.text;
    at = Math.max(at, s.end);
  }
  return out + html.slice(at);
}
