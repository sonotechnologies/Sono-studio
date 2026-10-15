import 'server-only';
import { fetchBytes, LinkError, checkUrl } from '@/style/link';
import type { CopyEdit } from './edit';
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

export const LIMITS = { pages: 40, files: 600, bytes: 45 * 1024 * 1024, ms: 200_000 };
/** Per file: big photos and videos stay on the old site rather than crowd out the rest. */
const FILE_CAP: Record<RefKind, number> = { style: 3e6, script: 4e6, font: 2e6, image: 4e6, media: 15e6, other: 3e6, page: 3e6 };
/** What to fetch first when space or time runs short: what makes the pages look right. */
const PRIORITY: Record<RefKind, number> = { style: 0, font: 1, script: 2, image: 3, media: 4, other: 5, page: 6 };

export interface CopyNote {
  title: string;
  detail: string;
}

export interface MirrorMeta {
  sourceUrl: string;
  copiedAt: string;
  pages: { path: string; title: string; url: string }[];
  files: number;
  bytes: number;
  /** Files referred to but not copied (left pointing at the old site or missing). */
  missing: string[];
  /** Plain warnings for the handover. Older copies stored plain strings. */
  notes: (CopyNote | string)[];
  /** Changes made in the studio's editor, applied over the copied pages. */
  edits?: CopyEdit[];
  editedAt?: string;
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

const LANGS = new Set('en de fr it es nl pt ru pl cs hu ja zh ar tr sv da no nb fi el ko he sk sl hr ro bg uk et lv lt sr ca id th vi'.split(' '));

/** "de" for /de/zimmer or /de-at/zimmer; null when a path has no language segment. */
export function langOf(pathname: string): string | null {
  const m = /^\/([a-z]{2})(?:[-_][a-z]{2})?(?:\/|$)/i.exec(pathname);
  return m && LANGS.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}

type Asset = { url: URL; kind: RefKind; path: string; order: number; bytes?: Uint8Array; text?: string; status?: 'copied' | 'left' | 'failed' };

export async function copySite(address: string, onProgress?: (line: string) => void): Promise<MirrorResult> {
  const started = Date.now();
  const start = await checkUrl(address);
  const first = await fetchBytes(start.toString(), 3 * 1024 * 1024);
  if (!first) throw new LinkError('That site couldn’t be reached. Check the address.');
  if (!/html/.test(first.type)) throw new LinkError('That address isn’t a web page.');
  const origin = first.url;
  const firstHtml = new TextDecoder().decode(first.bytes);
  // Multilingual sites repeat every page per language: stay in the one the address (or home page) is in.
  const lang = langOf(origin.pathname) ?? (/<html[^>]*\slang=["']?([a-z]{2})/i.exec(firstHtml)?.[1].toLowerCase() || null);
  const otherLanguages = new Set<string>();

  const pages = new Map<string, { url: URL; html: string; path: string; title: string }>();
  const queue: URL[] = [];
  const assets = new Map<string, Asset>();
  const notes = new Map<string, CopyNote>();
  const note = (k: string, title: string, detail: string) => notes.set(k, { title, detail });
  let bytes = 0;
  let order = 0;
  const outOfTime = () => Date.now() - started > LIMITS.ms;

  const addAsset = (u: URL, kind: RefKind) => {
    if (!shouldCopy(u, origin, kind) || assets.has(key(u))) return;
    assets.set(key(u), { url: u, kind, path: assetPath(u, origin), order: PRIORITY[kind] * 1e6 + order++ });
  };

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
        if (!sameSite(u, origin) || !isPageUrl(u)) continue;
        u.search = '';
        const l = langOf(u.pathname);
        if (lang && l && l !== lang) {
          otherLanguages.add(l);
          continue;
        }
        if (!pages.has(key(u)) && !queue.some((q) => key(q) === key(u))) queue.push(u);
      } else addAsset(u, ref.kind);
    }
  };

  addPage(origin, firstHtml);
  onProgress?.('Copied the home page');

  // Pages, breadth first, staying on the site and in one language.
  while (queue.length && pages.size < LIMITS.pages && !outOfTime()) {
    const next = queue.shift()!;
    const got = await fetchBytes(next.toString(), 3 * 1024 * 1024);
    if (!got || !/html/.test(got.type) || !sameSite(got.url, origin)) continue;
    addPage(next, new TextDecoder().decode(got.bytes));
    onProgress?.(`Copied ${pages.size} page${pages.size === 1 ? '' : 's'}`);
  }
  if (queue.length && pages.size >= LIMITS.pages)
    note('pages', 'More pages than fit', `The site has more than ${LIMITS.pages} pages${lang ? ` in this language` : ''}. The first ${LIMITS.pages} (by distance from the home page) were copied; links to the rest go to the old site.`);
  if (otherLanguages.size)
    note('languages', 'One language copied', `Only the ${lang?.toUpperCase()} pages were copied; links to the ${[...otherLanguages].map((l) => l.toUpperCase()).join(', ')} versions go to the old site. Copy those addresses separately if they're needed.`);

  // Files, most important first, a few at a time. Stylesheets can name more files (fonts, images, imports).
  const pending = () => [...assets.values()].filter((a) => !a.status).sort((a, b) => a.order - b.order);
  while (pending().length && !outOfTime()) {
    const batch = pending().slice(0, 6);
    await Promise.all(
      batch.map(async (a) => {
        if (bytes > LIMITS.bytes || [...assets.values()].filter((x) => x.status === 'copied').length >= LIMITS.files) {
          a.status = 'left';
          return;
        }
        const got = await fetchBytes(a.url.toString(), FILE_CAP[a.kind]);
        if (!got || bytes + got.bytes.byteLength > LIMITS.bytes) {
          a.status = got ? 'left' : 'failed';
          return;
        }
        a.bytes = got.bytes;
        a.status = 'copied';
        bytes += got.bytes.byteLength;
        if (a.kind === 'style' || /text\/css/.test(got.type)) {
          a.kind = 'style';
          a.text = new TextDecoder().decode(got.bytes);
          for (const ref of cssRefs(a.text, got.url)) {
            const u = new URL(ref.url);
            u.hash = '';
            addAsset(u, ref.kind);
          }
        }
      }),
    );
    onProgress?.(`Copied ${[...assets.values()].filter((x) => x.status === 'copied').length} files`);
  }
  for (const a of pending()) a.status = 'left';

  // Rewrite references to point at the copy; anything not copied keeps its full address.
  const copied = (u: URL) => {
    const k = key(u);
    const page = pages.get(k) ?? (isPageUrl(u) && sameSite(u, origin) ? pages.get(key(Object.assign(new URL(u), { search: '' }))) : undefined);
    if (page) return page.path;
    const a = assets.get(k);
    return a?.status === 'copied' ? a.path : null;
  };
  const mapperFor = (from: string) => (u: URL) => {
    const target = copied(u);
    return target ? relative(from, target) : u.toString();
  };

  const files: MirrorResult['files'] = [];
  const enc = new TextEncoder();
  const emptyPages: string[] = [];
  for (const p of pages.values()) {
    files.push({ path: p.path, data: enc.encode(rewriteHtml(p.html, baseOf(p.html, p.url), mapperFor(p.path))) });
    const words = p.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter((w) => w.length > 2).length;
    if (words < 40) emptyPages.push(p.title || p.path);
  }
  const missing: string[] = [];
  let left = 0;
  for (const a of assets.values()) {
    if (a.status === 'copied' && a.bytes) {
      if (a.kind === 'style' && a.text !== undefined) files.push({ path: a.path, data: enc.encode(rewriteCss(a.text, a.url, mapperFor(a.path))) });
      else files.push({ path: a.path, data: a.bytes });
    } else {
      missing.push(a.url.toString());
      if (a.status === 'left') left++;
    }
  }
  const failed = missing.length - left;

  const all = [...pages.values()].map((p) => p.html).join('\n');
  if (/<form\b/i.test(all)) note('forms', 'Forms', 'Contact, booking and newsletter forms still send to the old site’s server, or nowhere once it’s switched off. Replace them before the old hosting ends.');
  if (emptyPages.length)
    note('js', 'Pages built by JavaScript', `${emptyPages.slice(0, 3).map((t) => `“${t}”`).join(', ')}${emptyPages.length > 3 ? ` and ${emptyPages.length - 3} more` : ''} have almost no text in their HTML. They’re probably built by JavaScript and may look empty without the old site’s server.`);
  if (/googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|clarity\.ms/i.test(all)) note('analytics', 'Old tracking codes', 'The pages include the old site’s analytics or tracking codes. Remove them or swap in the client’s own.');
  if (/wp-content|wp-json|wix|squarespace|webflow|shopify/i.test(all)) note('cms', 'Site builder features', 'It was built with a site builder or CMS: its editor, plugins, booking and shop features don’t come across, only the pages as visitors see them.');
  if (left)
    note('left', 'Files left on the old site', `${left} file${left === 1 ? '' : 's'} (mostly large photos and videos) didn’t fit in the copy’s ${Math.round(LIMITS.bytes / 1024 / 1024)} MB and still load from the old site. They’ll disappear when it does: copy fewer pages, or replace them with the client’s own photos.`);
  if (failed) note('failed', 'Files that couldn’t be copied', `${failed} file${failed === 1 ? '' : 's'} couldn’t be downloaded and still point at where they were.`);
  if (outOfTime()) note('time', 'Stopped early', 'Copying hit its time limit; files it didn’t reach still load from the old site.');

  return {
    files,
    meta: {
      sourceUrl: origin.toString(),
      copiedAt: new Date().toISOString(),
      pages: [...pages.values()].map((p) => ({ path: p.path, title: p.title, url: p.url.toString() })),
      files: files.length,
      bytes: files.reduce((sum, f) => sum + f.data.byteLength, 0),
      missing: missing.slice(0, 50),
      notes: [...notes.values()],
    },
  };
}
