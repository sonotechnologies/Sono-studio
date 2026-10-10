import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id, assetId } = await params;
  await (await getRepo()).deleteAsset(id, assetId);
  return NextResponse.json({ ok: true });
}
