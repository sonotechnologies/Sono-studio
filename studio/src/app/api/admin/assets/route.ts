import { NextResponse } from 'next/server';
import { adminToken } from '@/lib/admin';
import { getRepo } from '@/lib/auth';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;

/** A client uploads a photo for their site (downscaled in the browser first). */
export async function POST(req: Request) {
  const token = await adminToken();
  if (!token) return NextResponse.json({ error: 'Signed out. Sign in again.' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Use JPG, PNG or WebP' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photos must be under 5 MB' }, { status: 413 });
  const asset = await (await getRepo()).adminUpload(token, { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type, ext }, String(form.get('alt') ?? '').slice(0, 200));
  if (!asset) return NextResponse.json({ error: 'The upload wasn’t accepted. Sign in again, or try in a few minutes.' }, { status: 403 });
  return NextResponse.json({ asset });
}
