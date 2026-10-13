import { createHash } from 'node:crypto';
import { getRepo, getUser } from '@/lib/auth';
import { fileFor, filesOf, mimeOf } from '@/mirror/zip-files';

/** Private (signed in only), kept for an hour, then checked against the copy's date. */
const CACHE = 'private, max-age=3600, must-revalidate';

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
  // The copy only changes when it's made again, so its date identifies this version of every file.
  const etag = `"${createHash('sha256').update(`${id}:${meta.copiedAt}:${path.join('/')}`).digest('hex').slice(0, 32)}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': CACHE } });
  const files = await filesOf(`${id}:${meta.copiedAt}`, async () => (await repo.getSiteCopy(id))?.zip ?? null);
  if (!files) return new Response('The site copy is missing', { status: 404 });
  const file = fileFor(files, (path ?? []).map(decodeURIComponent).join('/'));
  if (!file) return new Response('Not in the copy', { status: 404 });
  const isHtml = file.endsWith('.html');
  const body = isHtml ? new TextDecoder().decode(files[file]).replace(/<\/body>/i, `${NOTE}</body>`) : files[file];
  return new Response(body as unknown as BodyInit, {
    headers: {
      'content-type': mimeOf(file),
      // No scripts, no form posts: the copy can't act as the signed-in studio.
      'content-security-policy': "sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; script-src 'none'; object-src 'none'; base-uri 'none'",
      'x-content-type-options': 'nosniff',
      // Your browser keeps each file and only asks whether it changed, instead of downloading it again.
      'cache-control': CACHE,
      etag,
    },
  });
}
