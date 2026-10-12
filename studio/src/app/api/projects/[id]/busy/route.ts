import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';
import { busyFor, busyRange } from '@/lib/checkout';

/** Times already booked, for the booking widget in the studio preview. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ busy: [] }, { status: 401 });
  const { id } = await params;
  const range = busyRange(req.url);
  if (!range) return NextResponse.json({ busy: [] }, { status: 400 });
  return NextResponse.json({ busy: await busyFor(await getRepo(), { kind: 'preview', projectId: id }, range.from, range.to) });
}
