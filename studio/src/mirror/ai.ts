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

/** How much of a page the model is shown; longer pages are cut, starting from what's selected. */
const MAX_CHARS = 16_000;

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

  // Selected texts first, then the rest in page order, until the budget runs out.
  const chosen = new Set(input.selected);
  const order = [...texts.filter((t) => chosen.has(t.index)), ...texts.filter((t) => !chosen.has(t.index))];
  const lines: string[] = [];
  let used = 0;
  let cut = false;
  for (const t of order) {
    const line = `T${t.index}${chosen.has(t.index) ? ' (selected)' : ''}: ${JSON.stringify(t.now)}`;
    if (used + line.length > MAX_CHARS) {
      cut = true;
      break;
    }
    lines.push(line);
    used += line.length;
  }
  const textLines = lines.sort((a, b) => Number(/^T(\d+)/.exec(a)![1]) - Number(/^T(\d+)/.exec(b)![1]));
  const links = spots.links.slice(0, 150).map((l) => {
    const words = tidy(texts.filter((t) => spots.texts[t.index] && isInside(spots.texts[t.index].parent, l.node)).map((t) => t.now).join(' '));
    return `L${l.index}: ${linkNow(l.index)}${words ? ` (${JSON.stringify(words.slice(0, 60))})` : ''}`;
  });
  const images = spots.images.slice(0, 80).map((i) => `I${i.index}: alt=${JSON.stringify(altNow(i.index))} file=${i.src.split('/').pop()}`);

  const system = `You edit the words of an existing website for a web designer, without changing its design.
The page is given as numbered texts (T), links (L) and pictures (I). Reply with only a JSON object:
{"reply": "one or two plain sentences on what you changed, or a question if the request is unclear", "changes": [...]}
Changes:
- {"kind":"text","id":12,"to":"new words"} replaces text T12. Add "everywhere":true when the same text on the site's other pages should change too (a phone number, an address, a menu item, a footer line).
- {"kind":"link","id":3,"href":"https://…"} changes where link L3 goes. Pages of the site are named like "about.html". WhatsApp: https://wa.me/<number with country code, digits only>. Phone: tel:+234…. Email: mailto:…
- {"kind":"alt","id":2,"alt":"…"} changes picture I2's description.
Rules:
- Change only what the request asks for. Leave every other text exactly as it is and don't list it.
- Each text is a piece of a sentence or a label in the design: replace it with plain text (no HTML, no markdown), keep about the same length unless asked, and keep its language, capitals and punctuation style unless asked.
- Words split across several texts (a bold word inside a heading) are separate T numbers: change each piece so the whole still reads right.
- Never invent facts (prices, phone numbers, addresses, names, opening hours). Use only what the request gives or what the page already says; if something is needed and missing, ask in "reply" and make no changes.
- Pictures can't be swapped from here: say they can be replaced by clicking them in the editor.
- If nothing needs changing, return "changes": [] and say why.`;

  const history = input.history.slice(-6).map((m) => `${m.role === 'user' ? 'Designer' : 'You'}: ${m.text.slice(0, 600)}`).join('\n');
  const prompt = `Page: ${input.title || input.page} (${input.page})

Texts:
${textLines.join('\n')}${cut ? '\n(The rest of the page is left out; select a part in the editor to work on it.)' : ''}

Links:
${links.join('\n') || '(none)'}

Pictures:
${images.join('\n') || '(none)'}
${history ? `\nEarlier in this conversation:\n${history}\n` : ''}
Request: ${input.message}`;
  return { system, prompt };
}

function isInside(node: unknown, ancestor: unknown): boolean {
  let n = node as { parentNode?: unknown } | undefined;
  while (n) {
    if (n === ancestor) return true;
    n = n.parentNode as { parentNode?: unknown } | undefined;
  }
  return false;
}

/**
 * The model's changes as editor edits, merged into the current list (a newer
 * change to the same spot replaces the older). Changes to numbers that don't
 * exist, unsafe links and changes that change nothing are dropped.
 */
export function aiEdits(page: string, html: string, edits: CopyEdit[], reply: CopyAiReply): { edits: CopyEdit[]; added: CopyEdit[]; dropped: number } {
  const spots = findSpots(html);
  const texts = currentTexts(page, html, edits);
  let next = [...edits];
  const added: CopyEdit[] = [];
  let dropped = 0;
  for (const c of reply.changes) {
    if (c.kind === 'text') {
      const t = texts[c.id];
      // Formatting tags a model sometimes adds; other text in angle brackets is kept (it can be real text).
      const to = c.to.replace(/<\/?(b|strong|i|em|u|span|br|p|div|a|mark|small)(\s[^>]*)?\/?>/gi, '').trim();
      if (!t || !to || tidy(to) === t.now) {
        dropped++;
        continue;
      }
      next = next.filter((e) => !(e.kind === 'text' && ((e.page === page && e.index === t.index) || (e.page === '*' && tidy(e.from) === t.original))));
      const edit: CopyEdit = { kind: 'text', page: c.everywhere ? '*' : page, index: t.index, from: t.original, to };
      if (tidy(to) !== t.original) next.push(edit);
      added.push(edit);
    } else if (c.kind === 'link') {
      const l = spots.links[c.id];
      const href = safeHref(c.href);
      if (!l || !href) {
        dropped++;
        continue;
      }
      next = next.filter((e) => !(e.kind === 'link' && e.page === page && e.index === l.index));
      const edit: CopyEdit = { kind: 'link', page, index: l.index, from: l.href, href };
      if (href !== l.href) next.push(edit);
      added.push(edit);
    } else {
      const img = spots.images[c.id];
      if (!img) {
        dropped++;
        continue;
      }
      const prev = next.find((e) => e.kind === 'image' && e.page === page && e.index === img.index);
      next = next.filter((e) => e !== prev);
      const edit: CopyEdit = { kind: 'image', page, index: img.index, from: img.src, ...(prev?.kind === 'image' && prev.src ? { src: prev.src } : {}), alt: c.alt };
      next.push(edit);
      added.push(edit);
    }
  }
  return { edits: next, added, dropped };
}
