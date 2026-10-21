import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { readCss, readLook } from './css';
import { parseColor, type ReferenceInput, type WeightedColor } from './reference';

/*
 * Reads a web page's look from its HTML and CSS: the colours it uses (weighted
 * by where they appear), its fonts, and its declared background. Only public
 * http(s) addresses are fetched, with size and time limits.
 */

export class LinkError extends Error {}

const MAX_HTML = 1_500_000;
const MAX_CSS = 600_000;
const MAX_SHEETS = 4;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Refuses anything that isn't a public web address. */
export async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new LinkError('That doesn’t look like a web address.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new LinkError('Use an http or https address.');
  if (url.username || url.password) throw new LinkError('Use an address without a username or password.');
  const local = process.env.NODE_ENV !== 'production' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (!local) {
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length) throw new LinkError('That site couldn’t be found. Check the address.');
    if (addresses.some((a) => privateAddress(a.address))) throw new LinkError('Only public websites can be used as a reference.');
  }
  return url;
}

/** Fetches with redirects followed by hand, so every hop is checked. */
export async function get(raw: string, limit: number, accept: string): Promise<{ url: URL; text: string; type: string }> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; SonoStudio/1.0; reference reader)' },
      signal: AbortSignal.timeout(10_000),
    }).catch((err: Error) => {
      throw new LinkError(err.name === 'TimeoutError' ? 'That site took too long to answer.' : 'That site couldn’t be reached.');
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await checkUrl(new URL(res.headers.get('location')!, url).toString());
      continue;
    }
    if (!res.ok) throw new LinkError(`That site answered with an error (${res.status}).`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(Math.min(size, limit));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c.subarray(0, Math.max(0, bytes.length - offset)), offset);
      offset += c.byteLength;
    }
    return { url, text: new TextDecoder().decode(bytes), type: res.headers.get('content-type') ?? '' };
  }
  throw new LinkError('That address redirects too many times.');
}

export interface LinkReference extends ReferenceInput {
  title: string;
  url: string;
}

/** Fetches one web page's HTML (public addresses only). */
export async function fetchPage(address: string): Promise<{ url: URL; html: string }> {
  const page = await get(address, MAX_HTML, 'text/html,application/xhtml+xml');
  if (!/html/i.test(page.type) && !/<html/i.test(page.text.slice(0, 2000))) throw new LinkError('That address isn’t a web page.');
  return { url: page.url, html: page.text };
}

export async function readLink(address: string): Promise<LinkReference> {
  return lookOfPage(await fetchPage(address));
}

/** Colours, fonts and look of a page already fetched. */
export async function lookOfPage(page: { url: URL; html: string }): Promise<LinkReference> {
  const html = page.html;
  const colors = new Map<string, number>();
  const fonts = new Map<string, number>();
  const out: { background?: string; text?: string } = {};

  // Google Fonts links name the families directly.
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi)) {
    for (const f of m[1].replace(/&amp;/g, '&').matchAll(/family=([^:&]+)/g)) {
      const name = decodeURIComponent(f[1].replace(/\+/g, ' '));
      fonts.set(name, (fonts.get(name) ?? 0) + 5);
    }
  }
  const theme = /<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i.exec(html);
  const themeColor = theme ? parseColor(theme[1]) : null;
  if (themeColor) colors.set(themeColor, (colors.get(themeColor) ?? 0) + 8);

  const cssTexts: string[] = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    readCss(m[1], colors, fonts, out);
    cssTexts.push(m[1]);
  }
  for (const m of html.matchAll(/\sstyle=["']([^"']+)["']/gi)) readCss(`x{${m[1]}}`, colors, fonts, {});
  const sheets = [...html.matchAll(/<link[^>]+>/gi)]
    .map((m) => m[0])
    .filter((tag) => /rel=["']?[^"'>]*stylesheet/i.test(tag) && !/fonts\.googleapis/i.test(tag))
    .map((tag) => /href=["']([^"']+)["']/i.exec(tag)?.[1])
    .filter((h): h is string => !!h)
    .slice(0, MAX_SHEETS);
  for (const href of sheets) {
    try {
      const css = await get(new URL(href.replace(/&amp;/g, '&'), page.url).toString(), MAX_CSS, 'text/css');
      readCss(css.text, colors, fonts, out);
      cssTexts.push(css.text);
    } catch {
      // A stylesheet that can't be read just contributes nothing.
    }
  }
  if (!colors.size && !fonts.size) throw new LinkError('No colours or fonts could be read from that page. Try a screenshot instead.');

  const weighted: WeightedColor[] = [...colors].map(([hex, weight]) => ({ hex, weight }));
  const title = (/<title[^>]*>([^<]{1,120})/i.exec(html)?.[1] ?? page.url.hostname).trim();
  return {
    kind: 'link',
    colors: weighted,
    fonts: [...fonts].sort((a, b) => b[1] - a[1]).map(([f]) => f),
    background: out.background,
    text: out.text,
    look: readLook(html, cssTexts),
    title,
    url: page.url.toString(),
  };
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

/** A response's body, read until `limit` bytes and no further (a missing or wrong length header can't make it read more). */
async function readCapped(res: Response, limit: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Downloads one image from a public address (no redirects to private ones), up to 5 MB. */
export async function fetchImage(raw: string): Promise<{ bytes: Uint8Array; contentType: string; ext: string } | null> {
  try {
    let url = await checkUrl(raw);
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url, { redirect: 'manual', headers: { accept: 'image/*' }, signal: AbortSignal.timeout(10_000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = await checkUrl(new URL(res.headers.get('location')!, url).toString());
        continue;
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!res.ok || !IMAGE_TYPES[type]) return null;
      if (Number(res.headers.get('content-length') ?? 0) > 5 * 1024 * 1024) return null;
      const bytes = await readCapped(res, 5 * 1024 * 1024);
      if (!bytes || bytes.byteLength < 2000) return null;
      return { bytes, contentType: type, ext: IMAGE_TYPES[type] };
    }
  } catch {}
  return null;
}

/** Downloads any file from a public address (every redirect re-checked), up to `limit` bytes. */
export async function fetchBytes(raw: string, limit: number): Promise<{ url: URL; bytes: Uint8Array; type: string } | null> {
  try {
    let url = await checkUrl(raw);
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; SonoStudio/1.0; site copy)' }, signal: AbortSignal.timeout(15_000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = await checkUrl(new URL(res.headers.get('location')!, url).toString());
        continue;
      }
      if (!res.ok) return null;
      if (Number(res.headers.get('content-length') ?? 0) > limit) return null;
      const bytes = await readCapped(res, limit);
      if (!bytes) return null;
      return { url, bytes, type: (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() };
    }
  } catch {}
  return null;
}
