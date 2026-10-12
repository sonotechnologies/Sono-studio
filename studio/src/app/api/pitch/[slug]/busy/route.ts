import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/auth';
import { busyFor, busyRange } from '@/lib/checkout';
import { validSlug } from '@/lib/pitch';

/** Times already booked on a pitch link's demo, so the booking widget leaves them out. Never who booked them. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const range = busyRange(req.url);
  if (!validSlug(slug) || !range) return NextResponse.json({ busy: [] }, { status: 400 });
  return NextResponse.json({ busy: await busyFor(await getRepo(), { kind: 'pitch', slug }, range.from, range.to) }, { headers: { 'cache-control': 'no-store' } });
}
