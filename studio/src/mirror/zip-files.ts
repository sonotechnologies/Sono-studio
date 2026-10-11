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

// Unzipping a large copy on every request would be slow; keep the last few.
const cache = new Map<string, Record<string, Uint8Array>>();

export function filesOf(cacheKey: string, zip: Uint8Array): Record<string, Uint8Array> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const files = unzipSync(zip);
  cache.set(cacheKey, files);
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  return files;
}

/** The file a request path means: "" → index.html, "about" → about.html or about/index.html. */
export function fileFor(files: Record<string, Uint8Array>, path: string): string | null {
  const p = path.replace(/^\/+|\/+$/g, '');
  for (const candidate of [p || 'index.html', `${p}.html`, `${p}/index.html`]) if (files[candidate]) return candidate;
  return null;
}
