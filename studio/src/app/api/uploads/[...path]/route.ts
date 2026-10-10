import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from '@/lib/data/dev-repo';
import { isDevStore } from '@/lib/env';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };

/** Serves dev-store uploads. With Supabase, images come straight from its public storage bucket. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isDevStore()) return new Response('Not found', { status: 404 });
  const parts = (await params).path;
  if (parts.length !== 2 || parts.some((p) => !/^[a-zA-Z0-9-]+(\.[a-z]+)?$/.test(p))) return new Response('Not found', { status: 404 });
  const file = path.join(UPLOAD_DIR, ...parts);
  const type = TYPES[path.extname(file).slice(1)];
  if (!type) return new Response('Not found', { status: 404 });
  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: {
        'content-type': type,
        'cache-control': 'private, max-age=31536000, immutable',
        // An SVG opened directly must not run scripts on this origin.
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
