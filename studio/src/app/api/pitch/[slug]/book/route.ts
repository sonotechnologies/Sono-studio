import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/auth';
import { PaymentError, startBooking } from '@/lib/checkout';
import { validSlug } from '@/lib/pitch';

/** A test booking from a pitch link: holds the time and returns the deposit's payment page. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validSlug(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    return NextResponse.json({ url: await startBooking(await getRepo(), { kind: 'pitch', slug }, await req.json().catch(() => null), new URL(req.url).origin) });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('pitch booking failed', err);
    return NextResponse.json({ error: 'The booking couldn’t start. Try again in a moment.' }, { status: 500 });
  }
}
