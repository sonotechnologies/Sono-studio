import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/auth';
import { PaymentError, startCheckout } from '@/lib/checkout';
import { validSlug } from '@/lib/pitch';

/** A test checkout from a pitch link: returns the payment page to send the customer to. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validSlug(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const url = await startCheckout(await getRepo(), { kind: 'pitch', slug }, await req.json().catch(() => null), new URL(req.url).origin);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('pitch checkout failed', err);
    return NextResponse.json({ error: 'The payment couldn’t start. Try again in a moment.' }, { status: 500 });
  }
}
