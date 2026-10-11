import { createHash } from 'node:crypto';

/*
 * The parts of copying a site that don't touch the network: where each URL is
 * saved in the copy, which references a page or stylesheet makes, and how
 * those references are rewritten so the copy points at itself.
 */

/** Hosts whose files stay where they are: shared CDNs and services that are meant to be linked. */
const KEEP_REMOTE =
  /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|ajax\.googleapis\.com|code\.jquery\.com|use\.typekit\.net|use\.fontawesome\.com|kit\.fontawesome\.com|maps\.googleapis\.com|maps\.gstatic\.com|google\.com|gstatic\.com|youtube\.com|ytimg\.com|vimeo\.com|vimeocdn\.com|googletagmanager\.com|google-analytics\.com|facebook\.net|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|hotjar\.com|stripe\.com|paypal\.com|recaptcha\.net|cloudflareinsights\.com|images\.unsplash\.com|images\.pexels\.com)$/i;

const PAGE_EXT = /\.(html?|php|aspx?|jsp|cfm)$/i;
const FILE_EXT = /\.(css|js|mjs|json|xml|txt|jpe?g|png|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|ogg|wav|pdf|zip|map)$/i;

export type RefKind = 'page' | 'style' | 'script' | 'image' | 'font' | 'media' | 'other';

/** Same site: the same host, with or without "www.". */
export function sameSite(a: URL, b: URL): boolean {
  return a.host.replace(/^www\./, '') === b.host.replace(/^www\./, '');
}

export function isPageUrl(u: URL): boolean {
  const last = u.pathname.split('/').pop() ?? '';
  return !last.includes('.') || PAGE_EXT.test(last);
}

export function kindOf(u: URL, hint?: RefKind): RefKind {
  const p = u.pathname.toLowerCase();
  if (/\.css$/.test(p)) return 'style';
  if (/\.m?js$/.test(p)) return 'script';
  if (/\.(jpe?g|png|gif|webp|avif|svg|ico|bmp)$/.test(p)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)$/.test(p)) return 'font';
  if (/\.(mp4|webm|mov|mp3|ogg|wav)$/.test(p)) return 'media';
  return hint ?? 'other';
}

/** Whether a file is copied into the site rather than left at its address. */
export function shouldCopy(u: URL, origin: URL, kind: RefKind): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (sameSite(u, origin)) return kind !== 'page';
  if (KEEP_REMOTE.test(u.hostname)) return false;
  // Other hosts (a site builder's CDN, say) may disappear with the old account: keep their images, styles and fonts.
  return kind === 'image' || kind === 'style' || kind === 'font' || kind === 'media';
}

const safe = (s: string) =>
  s
    .split('/')
    .map((part) => {
      let p = part;
      try {
        p = decodeURIComponent(part);
      } catch {}
      return p.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '_').slice(0, 80);
    })
    .filter(Boolean)
    .join('/');

/** Where a page is saved: "/" → index.html, "/about/" → about.html, "/a/b" → a/b.html. */
export function pagePath(u: URL): string {
  const trimmed = u.pathname.replace(/\/+$/, '');
  if (!trimmed) return 'index.html';
  const p = safe(trimmed);
  return PAGE_EXT.test(p) ? p.replace(/\.(php|aspx?|jsp|cfm)$/i, '.html').replace(/\.htm$/i, '.html') : `${p}.html`;
}

/** Where a file is saved: its own path on the same site, under _ext/<host>/ for other hosts. Query strings get a short hash. */
export function assetPath(u: URL, origin: URL): string {
  let p = safe(u.pathname) || 'file';
  if (u.search) {
    const h = createHash('sha1').update(u.search).digest('hex').slice(0, 6);
    p = /\.[a-z0-9]{1,5}$/i.test(p) ? p.replace(/(\.[a-z0-9]{1,5})$/i, `-${h}$1`) : `${p}-${h}`;
  }
  if (!FILE_EXT.test(p) && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '.bin';
  return sameSite(u, origin) ? p : `_ext/${safe(u.hostname)}/${p}`;
}

/** A link from one saved file to another, relative so the copy works at any address or opened from disk. */
export function relative(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/') || to;
}

export interface Ref {
  url: string;
  kind: RefKind;
}

const resolve = (raw: string, base: URL): URL | null => {
  const v = raw.trim();
  if (!v || /^(#|data:|blob:|javascript:|mailto:|tel:|about:)/i.test(v)) return null;
  try {
    return new URL(v.replace(/&amp;/g, '&'), base);
  } catch {
    return null;
  }
};

/** The base URL a page's relative links resolve against (its <base href>, if any). */
export function baseOf(html: string, pageUrl: URL): URL {
  const b = /<base\s[^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
  return (b && resolve(b, pageUrl)) || pageUrl;
}

const ATTRS = ['href', 'src', 'srcset', 'data-src', 'data-srcset', 'data-lazy-src', 'data-bg', 'data-background', 'poster', 'imagesrcset'];

function tagKind(tag: string, attr: string): RefKind {
  const name = /^<([a-z0-9-]+)/i.exec(tag)?.[1].toLowerCase() ?? '';
  if (name === 'a' || name === 'area') return 'page';
  if (name === 'script') return 'script';
  if (name === 'link') {
    const rel = /rel=["']?([^"'>]+)/i.exec(tag)?.[1].toLowerCase() ?? '';
    const as = /\sas=["']?([a-z]+)/i.exec(tag)?.[1].toLowerCase();
    if (rel.includes('stylesheet') || as === 'style') return 'style';
    if (rel.includes('icon') || as === 'image' || attr === 'imagesrcset') return 'image';
    if (as === 'font') return 'font';
    if (as === 'script' || rel.includes('modulepreload')) return 'script';
    return 'other';
  }
  if (name === 'video' || name === 'audio' || (name === 'source' && /type=["']?(video|audio)/i.test(tag))) return attr === 'poster' ? 'image' : 'media';
  if (name === 'iframe' || name === 'form') return 'other';
  return 'image';
}

const splitSrcset = (v: string) => v.split(/,\s+(?=\S)/).map((part) => part.trim().split(/\s+/)[0]);

/** Every URL a page refers to, with what kind of file it is. */
export function htmlRefs(html: string, base: URL): Ref[] {
  const refs: Ref[] = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of clean.matchAll(/<[a-z][a-z0-9-]*\s[^>]*>/gi)) {
    const tag = m[0];
    if (/^<(meta|iframe|form)\b/i.test(tag)) continue;
    for (const attr of ATTRS) {
      const v = new RegExp(`\\s${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
      if (!v) continue;
      const value = v[1] ?? v[2] ?? '';
      const kind = tagKind(tag, attr);
      for (const raw of /srcset/.test(attr) ? splitSrcset(value) : [value]) {
        const u = resolve(raw, base);
        // A link to a PDF or image is a file, not a page.
        if (u) refs.push({ url: u.toString(), kind: kind === 'page' ? (isPageUrl(u) ? 'page' : kindOf(u)) : kindOf(u, kind) });
      }
    }
  }
  for (const m of clean.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) refs.push(...cssRefs(m[1], base));
  for (const m of clean.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) refs.push(...cssRefs(m[1] ?? m[2] ?? '', base));
  return refs;
}

/** URLs in a stylesheet: url(...) values and @import. */
export function cssRefs(css: string, base: URL): Ref[] {
  const refs: Ref[] = [];
  for (const m of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/gi)) {
    const u = resolve(m[1], base);
    if (u) refs.push({ url: u.toString(), kind: 'style' });
  }
  for (const m of css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
    const u = resolve(m[2], base);
    if (u) refs.push({ url: u.toString(), kind: kindOf(u, /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(m[2]) ? 'font' : 'image') });
  }
  return refs;
}

/** Maps an absolute URL to what the copy should say instead: a relative path if copied, the absolute URL if not. */
export type Mapper = (url: URL) => string | null;

function rewriteValue(value: string, base: URL, map: Mapper, srcset: boolean): string {
  const one = (raw: string) => {
    const u = resolve(raw, base);
    if (!u) return raw;
    const hash = u.hash;
    const mapped = map(u);
    return mapped !== null ? mapped + (mapped.startsWith('http') ? '' : hash) : u.toString();
  };
  if (!srcset) return one(value);
  return value
    .split(/,\s+(?=\S)/)
    .map((part) => {
      const [raw, ...rest] = part.trim().split(/\s+/);
      return [one(raw), ...rest].join(' ');
    })
    .join(', ');
}

export function rewriteCss(css: string, base: URL, map: Mapper): string {
  return css
    .replace(/@import\s+(url\(\s*)?(["']?)([^"')\s;]+)\2(\s*\))?/gi, (_m, open, q, raw, close) => `@import ${open ?? ''}${q}${rewriteValue(raw, base, map, false)}${q}${close ?? ''}`)
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, raw) => (/^(data:|#)/i.test(raw.trim()) ? m : `url(${q}${rewriteValue(raw, base, map, false)}${q})`));
}

/**
 * Points a page's links and files at the copy. Integrity hashes are dropped
 * from rewritten files (their bytes may change), and <base> is removed because
 * every link is now resolved.
 */
export function rewriteHtml(html: string, base: URL, map: Mapper): string {
  let out = html.replace(/<base\s[^>]*>/gi, '');
  out = out.replace(/<[a-z][a-z0-9-]*\s[^>]*>/gi, (tag) => {
    if (/^<meta\b/i.test(tag)) return tag;
    let t = tag;
    let changed = false;
    for (const attr of ATTRS) {
      t = t.replace(new RegExp(`(\\s${attr}\\s*=\\s*)(?:"([^"]*)"|'([^']*)')`, 'i'), (_m, pre, dq, sq) => {
        const value = dq ?? sq ?? '';
        const next = rewriteValue(value, base, map, /srcset/.test(attr));
        if (next !== value) changed = true;
        return `${pre}"${next.replace(/"/g, '&quot;')}"`;
      });
    }
    if (changed) t = t.replace(/\s(integrity)\s*=\s*(?:"[^"]*"|'[^']*')/i, '');
    return t.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i, (_m, dq, sq) => ` style="${rewriteCss(dq ?? sq ?? '', base, map).replace(/"/g, '&quot;')}"`);
  });
  return out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, css, close) => open + rewriteCss(css, base, map) + close);
}
