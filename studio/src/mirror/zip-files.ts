import { unzipSync } from 'fflate';

/** Content types for files in a site copy. */
export const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
};

export const mimeOf = (p: string) => MIME[p.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

// Unzipping a large copy on every request would be slow, and downloading it again for every
// image and stylesheet on a page would use up the storage egress; keep the last few unzipped.
const cache = new Map<string, Promise<Record<string, Uint8Array> | null>>();

/**
 * The copy's files, downloading the zip only when this server doesn't already
 * hold them. A page asks for all its files at once, so they share one download.
 */
export function filesOf(cacheKey: string, loadZip: () => Promise<Uint8Array | null>): Promise<Record<string, Uint8Array> | null> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const files = loadZip().then((zip) => (zip ? unzipSync(zip) : null));
  cache.set(cacheKey, files);
  // A failed or missing download isn't kept, so the next request tries again.
  files.then((f) => !f && cache.delete(cacheKey), () => cache.delete(cacheKey));
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  return files;
}

/** The file a request path means: "" → index.html, "about" → about.html or about/index.html. */
export function fileFor(files: Record<string, Uint8Array>, path: string): string | null {
  const p = path.replace(/^\/+|\/+$/g, '');
  for (const candidate of [p || 'index.html', `${p}.html`, `${p}/index.html`]) if (files[candidate]) return candidate;
  return null;
}
