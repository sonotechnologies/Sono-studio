import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_BYTES = 5 * 1024 * 1024;

/** Upload one photo or logo. Photos are downscaled in the browser first, so they arrive well under the limit. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  const repo = await getRepo();
  if (!(await repo.getProject(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  const kind = form.get('kind') === 'logo' ? 'logo' : 'photo';
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Use JPG, PNG, WebP or SVG' }, { status: 415 });
  if (ext === 'svg' && kind !== 'logo') return NextResponse.json({ error: 'SVG is accepted for logos only' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Files must be under 5 MB' }, { status: 413 });

  const num = (k: string) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  if (kind === 'logo') {
    // One logo per project: a new one replaces the old.
    for (const a of await repo.listAssets(id)) if (a.kind === 'logo') await repo.deleteAsset(id, a.id);
  }
  const asset = await repo.addAsset(
    id,
    { kind, source: 'upload', alt: String(form.get('alt') ?? '').slice(0, 200), credit: '', width: num('width'), height: num('height') },
    { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type, ext },
  );
  return NextResponse.json({ asset });
}
