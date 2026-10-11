import 'server-only';
import { fetchBytes, LinkError, checkUrl } from '@/style/link';
import {
  assetPath,
  baseOf,
  cssRefs,
  htmlRefs,
  isPageUrl,
  pagePath,
  relative,
  rewriteCss,
  rewriteHtml,
  sameSite,
  shouldCopy,
  type RefKind,
} from './rewrite';

/*
 * Copies a client's own website as it is: its pages and the stylesheets,
 * scripts, fonts and images they use, rewritten to point at each other, so
 * it can be exported or deployed unchanged. Only what a browser receives can
 * be copied; anything the old host ran on its server (forms, shops, logins)
 * stays behind, and the report says so.
 */

export const LIMITS = { pages: 40, files: 600, bytes: 45 * 1024 * 1024, fileBytes: 12 * 1024 * 1024, ms: 200_000 };

export interface MirrorMeta {
  sourceUrl: string;
  copiedAt: string;
  pages: { path: string; title: string; url: string }[];
  files: number;
  bytes: number;
  /** Files referred to but not copied (left pointing at the old site or missing). */
  missing: string[];
  /** Plain warnings for the handover: forms, analytics, pages built by JavaScript, limits reached. */
  notes: string[];
}

export interface MirrorResult {
  files: { path: string; data: Uint8Array }[];
  meta: MirrorMeta;
}

const key = (u: URL) => {
  const c = new URL(u);
  c.hash = '';
  return c.toString();
};

export async function copySite(address: string, onProgress?: (line: string) => void): Promise<MirrorResult> {
  const started = Date.now();
  const start = await checkUrl(address);
  const first = await fetchBytes(start.toString(), 3 * 1024 * 1024);
  if (!first) throw new LinkError('That site couldn’t be reached. Check the address.');
  if (!/html/.test(first.type)) throw new LinkError('That address isn’t a web page.');
  const origin = first.url;

  const pages = new Map<string, { url: URL; html: string; path: string; title: string }>();
  const queue: URL[] = [];
  const assets = new Map<string, { url: URL; kind: RefKind; path: string; bytes?: Uint8Array; type?: string; text?: string }>();
  const notes = new Set<string>();
  let bytes = 0;
  const outOfTime = () => Date.now() - started > LIMITS.ms;

  const addPage = (url: URL, html: string) => {
    const path = pagePath(url);
    if ([...pages.values()].some((p) => p.path === path)) return;
    const title = (/<title[^>]*>([^<]{0,120})/i.exec(html)?.[1] ?? path).trim();
    pages.set(key(url), { url, html, path, title });
    bytes += html.length;
    for (const ref of htmlRefs(html, baseOf(html, url))) {
      const u = new URL(ref.url);
      u.hash = '';
      if (ref.kind === 'page') {
        if (sameSite(u, origin) && isPageUrl(u)) {
          u.search = '';
          if (!pages.has(key(u)) && !queue.some((q) => key(q) === key(u))) queue.push(u);
        }
      } else if (shouldCopy(u, origin, ref.kind) && !assets.has(key(u))) {
        assets.set(key(u), { url: u, kind: ref.kind, path: assetPath(u, origin) });
      }
    }
  };

  addPage(origin, new TextDecoder().decode(first.bytes));
  onProgress?.('Copied the home page');

  // Pages, breadth first, staying on the site.
  while (queue.length && pages.size < LIMITS.pages && !outOfTime()) {
    const next = queue.shift()!;
    const got = await fetchBytes(next.toString(), 3 * 1024 * 1024);
    if (!got || !/html/.test(got.type) || !sameSite(got.url, origin)) continue;
    addPage(next, new TextDecoder().decode(got.bytes));
    onProgress?.(`Copied ${pages.size} page${pages.size === 1 ? '' : 's'}`);
  }
  if (queue.length && pages.size >= LIMITS.pages) notes.add(`The site has more than ${LIMITS.pages} pages; the first ${LIMITS.pages} were copied and links to the rest go to the old site.`);

  // Files, a few at a time. Stylesheets can name more files (fonts, images, imports).
  const pending = () => [...assets.values()].filter((a) => a.bytes === undefined);
  while (pending().length && !outOfTime()) {
    const batch = pending().slice(0, 6);
    await Promise.all(
      batch.map(async (a) => {
        if (assets.size > LIMITS.files || bytes > LIMITS.bytes) {
          a.bytes = new Uint8Array(0);
          return;
        }
        const got = await fetchBytes(a.url.toString(), LIMITS.fileBytes);
        a.bytes = got?.bytes ?? new Uint8Array(0);
        a.type = got?.type;
        bytes += a.bytes.byteLength;
        if (got && (a.kind === 'style' || /text\/css/.test(got.type))) {
          a.kind = 'style';
          a.text = new TextDecoder().decode(got.bytes);
          for (const ref of cssRefs(a.text, got.url)) {
            const u = new URL(ref.url);
            u.hash = '';
            if (shouldCopy(u, origin, ref.kind) && !assets.has(key(u))) assets.set(key(u), { url: u, kind: ref.kind, path: assetPath(u, origin) });
          }
        }
      }),
    );
    onProgress?.(`Copied ${[...assets.values()].filter((x) => x.bytes?.byteLength).length} files`);
  }
  if (assets.size > LIMITS.files || bytes > LIMITS.bytes) notes.add('The copy reached its size limit; some files still load from the old site.');
  if (outOfTime()) notes.add('Copying took too long to finish; some files still load from the old site.');

  // Rewrite references to point at the copy; anything not copied keeps its full address.
  const copied = (u: URL) => {
    const k = key(u);
    const page = pages.get(k) ?? (isPageUrl(u) && sameSite(u, origin) ? pages.get(key(Object.assign(new URL(u), { search: '' }))) : undefined);
    if (page) return page.path;
    const a = assets.get(k);
    return a?.bytes?.byteLength ? a.path : null;
  };
  const mapperFor = (from: string) => (u: URL) => {
    const target = copied(u);
    return target ? relative(from, target) : u.toString();
  };

  const files: MirrorResult['files'] = [];
  const enc = new TextEncoder();
  const missing: string[] = [];
  for (const p of pages.values()) {
    const html = rewriteHtml(p.html, baseOf(p.html, p.url), mapperFor(p.path));
    files.push({ path: p.path, data: enc.encode(html) });
    if (/<form\b[^>]*action=/i.test(p.html) || /<form\b/i.test(p.html)) notes.add('Forms (contact, booking, newsletter) still send to the old site’s server, or nowhere if it’s switched off. Replace them before the old hosting ends.');
    const words = p.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter((w) => w.length > 2).length;
    if (words < 40) notes.add(`“${p.title}” has almost no text in its HTML: it's probably built by JavaScript and may look empty without the old site's server.`);
  }
  for (const a of assets.values()) {
    if (!a.bytes?.byteLength) {
      missing.push(a.url.toString());
      continue;
    }
    if (a.kind === 'style' && a.text !== undefined) files.push({ path: a.path, data: enc.encode(rewriteCss(a.text, a.url, mapperFor(a.path))) });
    else files.push({ path: a.path, data: a.bytes });
  }

  const all = [...pages.values()].map((p) => p.html).join('\n');
  if (/googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|clarity\.ms/i.test(all)) notes.add('The pages include the old site’s analytics or tracking codes. Remove them or swap in the client’s own.');
  if (/wp-content|wp-json|wix|squarespace|webflow|shopify/i.test(all)) notes.add('It was built with a site builder or CMS: its editor, plugins and shop features don’t come across, only the pages as visitors see them.');
  if (missing.length) notes.add(`${missing.length} file${missing.length === 1 ? '' : 's'} couldn’t be copied and still load from where they were.`);

  const total = files.reduce((s, f) => s + f.data.byteLength, 0);
  return {
    files,
    meta: {
      sourceUrl: origin.toString(),
      copiedAt: new Date().toISOString(),
      pages: [...pages.values()].map((p) => ({ path: p.path, title: p.title, url: p.url.toString() })),
      files: files.length,
      bytes: total,
      missing: missing.slice(0, 50),
      notes: [...notes],
    },
  };
}

