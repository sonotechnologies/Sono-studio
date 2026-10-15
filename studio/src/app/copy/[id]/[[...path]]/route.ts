import { createHash } from 'node:crypto';
import { getRepo, getUser } from '@/lib/auth';
import { applyEdits } from '@/mirror/edit';
import { copyFile } from '@/mirror/files';
import { mimeOf } from '@/mirror/zip-files';

/** Private (signed in only), kept for an hour, then checked against the copy's date. */
const CACHE = 'private, max-age=3600, must-revalidate';
/** Pages change when they're edited, so the browser checks each time (a quick "not modified" when they haven't). */
const PAGE_CACHE = 'private, no-cache';
/** A thumbnail's address names the copy's version, so it never needs checking. */
const THUMB_CACHE = 'private, max-age=31536000, immutable';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shows a site copy for checking, inside the studio. Its scripts are not run
 * here (they could otherwise read the studio's session), so the copy's
 * styles, images, fonts and CSS animations show exactly, while effects made
 * with JavaScript appear once it's deployed or opened from the export. A
 * small note on each page says so.
 */
const NOTE = `<div style="position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:320px;padding:8px 12px;border-radius:10px;background:rgba(22,20,15,.88);color:#F7F5F1;font:500 12px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none">Sono Studio preview of the copy · scripts are off here, so JavaScript effects show once it’s deployed or opened from the export</div>`;
export async function GET(req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  if (!(await getUser())) return new Response('Not signed in', { status: 401 });
  const { id, path } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  // The copy's links are relative, so the home page needs a real file name in the address.
  if (!path?.length) return Response.redirect(new URL(`/copy/${id}/index.html`, req.url), 307);
  const repo = await getRepo();
  const meta = await repo.getSiteCopyMeta(id);
  if (!meta) return new Response('This project has no site copy', { status: 404 });
  const query = new URL(req.url).searchParams;
  // In the editor, each text, picture and link is marked so it can be clicked and changed.
  const editing = query.get('edit') === '1';
  // On project cards: the page as it is, without the preview note.
  const thumb = query.get('thumb') === '1';
  // The copy changes when it's made again or edited, so those dates identify this version of every file.
  const etag = `"${createHash('sha256').update(`${id}:${meta.copiedAt}:${meta.editedAt ?? ''}:${editing}:${thumb}:${path.join('/')}`).digest('hex').slice(0, 32)}"`;
  const pageCache = thumb && query.get('v') ? THUMB_CACHE : PAGE_CACHE;
  const cache = /\.html?$/i.test(path.at(-1) ?? '') || !/\.[a-z0-9]+$/i.test(path.at(-1) ?? '') ? pageCache : CACHE;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': cache } });
  const found = await copyFile(id, meta.copiedAt, (path ?? []).map(decodeURIComponent).join('/'), async () => (await repo.getSiteCopy(id))?.zip ?? null);
  if (!found) return new Response('The site copy is missing', { status: 404 });
  if (found === 'missing') return new Response('Not in the copy', { status: 404 });
  const file = found.path;
  const isHtml = file.endsWith('.html');
  let body: string | Uint8Array = found.data;
  if (isHtml) {
    const html = applyEdits(file, new TextDecoder().decode(found.data), meta.edits ?? [], { mark: editing }).html;
    body = editing || thumb ? html : html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${NOTE}</body>`);
  }
  return new Response(body as unknown as BodyInit, {
    headers: {
      'content-type': mimeOf(file),
      // No scripts, no form posts: the copy can't act as the signed-in studio.
      'content-security-policy': "sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; script-src 'none'; object-src 'none'; base-uri 'none'",
      'x-content-type-options': 'nosniff',
      // Your browser keeps each file and only asks whether it changed, instead of downloading it again.
      'cache-control': isHtml ? pageCache : CACHE,
      etag,
    },
  });
}
