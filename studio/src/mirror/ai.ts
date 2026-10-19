import { z } from 'zod';
import { findSpots, safeHref, tidy, type CopyEdit } from './edit';

/*
 * Asking AI to change a copied site. The model sees the page as a numbered
 * list of its texts, links and pictures (with any changes already made) and
 * answers with changes to those numbers. They become ordinary editor edits,
 * so they keep the layout, show in the change list and can be undone.
 */

export const copyAiReplySchema = z.object({
  reply: z.string().max(1500),
  changes: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('text'), id: z.number().int().min(0), to: z.string().max(5000), everywhere: z.boolean().optional() }),
        z.object({ kind: z.literal('link'), id: z.number().int().min(0), href: z.string().max(2000) }),
        z.object({ kind: z.literal('alt'), id: z.number().int().min(0), alt: z.string().max(500) }),
      ]),
    )
    .max(200),
});
export type CopyAiReply = z.infer<typeof copyAiReplySchema>;

/** How much of a page the model is shown, in all; longer pages are cut, starting from what's selected. */
const MAX_CHARS = 16_000;
const MAX_LINKS = 120;
const MAX_IMAGES = 60;

/** Each text on the page as it reads now, with the editor's changes. */
export function currentTexts(page: string, html: string, edits: CopyEdit[]) {
  const spots = findSpots(html);
  return spots.texts.map((t) => {
    const original = tidy(t.value);
    const own = edits.find((e) => e.kind === 'text' && e.page === page && e.index === t.index);
    const all = edits.find((e) => e.kind === 'text' && e.page === '*' && tidy(e.from) === original);
    return { index: t.index, original, now: own?.kind === 'text' ? tidy(own.to) : all?.kind === 'text' ? tidy(all.to) : original };
  });
}

/** The numbers the model was shown, so it can't change a spot it never saw. */
export interface Shown {
  texts: number[];
  links: number[];
  images: number[];
}

/** Where a text sits, in a few words: its tag and the part of the page around it ("h1", "a in nav"). */
function placeOf(node: unknown): string {
  type El = { tagName?: string; parentNode?: unknown };
  const own = (node as El).tagName ?? '';
  const around: string[] = [];
  let n = (node as El).parentNode as El | undefined;
  while (n && around.length < 2) {
    if (n.tagName && /^(a|button|nav|header|footer|li|label|th|td|figcaption|blockquote)$/.test(n.tagName) && !around.includes(n.tagName)) around.push(n.tagName);
    n = n.parentNode as El | undefined;
  }
  return [own, ...around].filter(Boolean).join(' in ');
}

export function copyAiPrompt(input: { page: string; title: string; html: string; edits: CopyEdit[]; message: string; selected: number[]; history: { role: 'user' | 'assistant'; text: string }[] }) {
  const spots = findSpots(input.html);
  const texts = currentTexts(input.page, input.html, input.edits);
  const linkNow = (i: number) => {
    const e = input.edits.find((x) => x.kind === 'link' && x.page === input.page && x.index === i);
    return e?.kind === 'link' ? e.href : spots.links[i].href;
  };
  const altNow = (i: number) => {
    const e = input.edits.find((x) => x.kind === 'image' && x.page === input.page && x.index === i);
    return e?.kind === 'image' && e.alt !== undefined ? e.alt : spots.images[i].alt;
  };

  const links = spots.links.slice(0, MAX_LINKS).map((l) => {
    const words = tidy(texts.filter((t) => spots.texts[t.index] && isInside(spots.texts[t.index].parent, l.node)).map((t) => t.now).join(' '));
    return { index: l.index, line: `L${l.index}: ${linkNow(l.index).slice(0, 200)}${words ? ` (${JSON.stringify(words.slice(0, 60))})` : ''}` };
  });
  const images = spots.images.slice(0, MAX_IMAGES).map((i) => ({ index: i.index, line: `I${i.index}: alt=${JSON.stringify(altNow(i.index).slice(0, 150))} file=${i.src.split('/').pop()?.slice(0, 60)}` }));
  const history = input.history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Designer' : 'You'}: ${m.text.slice(0, 600)}`)
    .join('\n');

  // Selected texts first, then the rest in page order, until the budget runs out.
  const chosen = new Set(input.selected);
  const order = [...texts.filter((t) => chosen.has(t.index)), ...texts.filter((t) => !chosen.has(t.index))];
  const budget = MAX_CHARS - links.reduce((n, l) => n + l.line.length, 0) - images.reduce((n, i) => n + i.line.length, 0) - history.length;
  const shownTexts: { index: number; line: string }[] = [];
  let used = 0;
  let cut = false;
  for (const t of order) {
    const spot = spots.texts[t.index];
    const line = `T${t.index} [${placeOf(spot.parent)}]${chosen.has(t.index) ? ' (selected)' : ''}: ${JSON.stringify(t.now)}`;
    if (used + line.length > Math.max(budget, 4000)) {
      cut = true;
      break;
    }
    shownTexts.push({ index: t.index, line });
    used += line.length;
  }
  shownTexts.sort((a, b) => a.index - b.index);

  const system = `You edit the words of an existing website for a web designer, without changing its design.
The page is given as numbered texts (T), links (L) and pictures (I). Each text shows its tag and where it sits ([h1], [span in a in nav]). Reply with only a JSON object:
{"reply": "one or two plain sentences on what you changed, or a question if the request is unclear", "changes": [...]}
Changes:
- {"kind":"text","id":12,"to":"new words"} replaces text T12. Add "everywhere":true when the same text on the site's other pages should change too (a phone number, an address, a menu item, a footer line).
- {"kind":"link","id":3,"href":"https://…"} changes where link L3 goes. Pages of the site are named like "about.html". WhatsApp: https://wa.me/<number with country code, digits only>. Phone: tel:+234…. Email: mailto:…
- {"kind":"alt","id":2,"alt":"…"} changes picture I2's description.
Rules:
- Use only the T, L and I numbers listed. Change only what the request asks for; leave every other text exactly as it is and don't list it.
- Each text is a piece of a sentence or a label in the design: replace it with plain text (no HTML, no markdown), keep about the same length unless asked, and keep its language, capitals and punctuation style unless asked. "to": "" removes the words.
- Words split across several texts (a bold word inside a heading) are separate T numbers: change each piece so the whole still reads right.
- Never invent facts (prices, phone numbers, addresses, names, opening hours). Use only what the request gives or what the page already says; if something is needed and missing, ask in "reply" and make no changes.
- Pictures can't be swapped from here: say they can be replaced by clicking them in the editor.
- "reply" describes only the changes you list. If nothing needs changing, return "changes": [] and say why.`;

  const prompt = `Page: ${input.title || input.page} (${input.page})

Texts:
${shownTexts.map((t) => t.line).join('\n')}${cut ? '\n(The rest of the page is left out; select a part in the editor to work on it.)' : ''}

Links:
${links.map((l) => l.line).join('\n') || '(none)'}${spots.links.length > MAX_LINKS ? '\n(More links are left out.)' : ''}

Pictures:
${images.map((i) => i.line).join('\n') || '(none)'}${spots.images.length > MAX_IMAGES ? '\n(More pictures are left out.)' : ''}
${history ? `\nEarlier in this conversation:\n${history}\n` : ''}
Request: ${input.message}`;
  const shown: Shown = { texts: shownTexts.map((t) => t.index), links: links.map((l) => l.index), images: images.map((i) => i.index) };
  return { system, prompt, shown };
}

function isInside(node: unknown, ancestor: unknown): boolean {
  let n = node as { parentNode?: unknown } | undefined;
  while (n) {
    if (n === ancestor) return true;
    n = n.parentNode as { parentNode?: unknown } | undefined;
  }
  return false;
}

/** One spot's identity in the list of changes: an "every page" text is known by its original words. */
export function editKey(e: CopyEdit): string {
  return e.kind === 'text' && e.page === '*' ? `*|text|${tidy(e.from)}` : `${e.page}|${e.kind}|${e.index}`;
}

export interface AiResult {
  /** The full new list of changes. */
  edits: CopyEdit[];
  /** Changes put in, and the earlier ones they replaced (both used to undo just these). */
  put: CopyEdit[];
  removed: CopyEdit[];
  /** How many of the model's changes did something. */
  changed: number;
  /** Changes that couldn't be used: unknown or unseen numbers, unsafe links. */
  dropped: number;
}

/**
 * The model's changes as editor edits, merged into the current list (a newer
 * change to the same spot replaces the older). Changes to numbers that don't
 * exist or weren't shown and unsafe links are dropped; ones that change
 * nothing are skipped.
 */
export function aiEdits(page: string, html: string, edits: CopyEdit[], reply: CopyAiReply, shown?: Shown): AiResult {
  const spots = findSpots(html);
  const texts = currentTexts(page, html, edits);
  const seen = shown && { texts: new Set(shown.texts), links: new Set(shown.links), images: new Set(shown.images) };
  let next = [...edits];
  const put: CopyEdit[] = [];
  const removed: CopyEdit[] = [];
  let changed = 0;
  let dropped = 0;
  const take = (drop: (e: CopyEdit) => boolean) => {
    for (const e of next) if (drop(e)) removed.push(e);
    next = next.filter((e) => !drop(e));
  };
  for (const c of reply.changes) {
    if (c.kind === 'text') {
      const t = texts[c.id];
      if (!t || (seen && !seen.texts.has(c.id))) {
        dropped++;
        continue;
      }
      // Formatting tags a model sometimes adds; other text in angle brackets is kept (it can be real text).
      const to = c.to.replace(/<\/?(b|strong|i|em|u|span|br|p|div|a|mark|small)(\s[^>]*)?\/?>/gi, '').trim();
      const star = (e: CopyEdit) => e.kind === 'text' && e.page === '*' && tidy(e.from) === t.original;
      if (tidy(to) === t.now && (!c.everywhere || next.some((e) => star(e) && e.kind === 'text' && tidy(e.to) === t.now))) continue;
      // This page's own change for the spot goes; the "every page" one only when this change is for every page too.
      take((e) => (e.kind === 'text' && e.page === page && e.index === t.index) || (!!c.everywhere && star(e)));
      const edit: CopyEdit = { kind: 'text', page: c.everywhere ? '*' : page, index: t.index, from: t.original, to };
      // Back to the original words: nothing to keep, unless an "every page" change would show through.
      if (tidy(to) !== t.original || (!c.everywhere && next.some(star))) {
        next.push(edit);
        put.push(edit);
      }
      changed++;
    } else if (c.kind === 'link') {
      const l = spots.links[c.id];
      const href = safeHref(c.href);
      if (!l || !href || (seen && !seen.links.has(c.id))) {
        dropped++;
        continue;
      }
      const prev = next.find((e) => e.kind === 'link' && e.page === page && e.index === l.index);
      if (href === (prev?.kind === 'link' ? prev.href : l.href)) continue;
      take((e) => e === prev);
      if (href !== l.href) {
        const edit: CopyEdit = { kind: 'link', page, index: l.index, from: l.href, href };
        next.push(edit);
        put.push(edit);
      }
      changed++;
    } else {
      const img = spots.images[c.id];
      if (!img || (seen && !seen.images.has(c.id))) {
        dropped++;
        continue;
      }
      const prev = next.find((e) => e.kind === 'image' && e.page === page && e.index === img.index);
      const alt = c.alt.trim();
      if (alt === (prev?.kind === 'image' && prev.alt !== undefined ? prev.alt : img.alt)) continue;
      take((e) => e === prev);
      const src = prev?.kind === 'image' ? prev.src : undefined;
      if (src || alt !== img.alt) {
        const edit: CopyEdit = { kind: 'image', page, index: img.index, from: img.src, ...(src ? { src } : {}), alt };
        next.push(edit);
        put.push(edit);
      }
      changed++;
    }
  }
  return { edits: next, put, removed, changed, dropped };
}

/** Puts a set of AI changes into a list, by spot: used to apply them over newer hand edits. */
export function mergeAi(edits: CopyEdit[], put: CopyEdit[], removed: CopyEdit[]): CopyEdit[] {
  const gone = new Set([...removed, ...put].map(editKey));
  return [...edits.filter((e) => !gone.has(editKey(e))), ...put];
}

/** Takes a set of AI changes back out, restoring what they replaced (unless the spot was changed again since). */
export function undoAi(edits: CopyEdit[], put: CopyEdit[], removed: CopyEdit[]): CopyEdit[] {
  const mine = new Set(put.map((e) => JSON.stringify(e)));
  const kept = edits.filter((e) => !mine.has(JSON.stringify(e)));
  const taken = new Set(kept.map(editKey));
  return [...kept, ...removed.filter((e) => !taken.has(editKey(e)))];
}
