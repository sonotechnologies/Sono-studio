import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';
import { PaymentError, startCheckout } from '@/lib/checkout';

/** A test checkout from the studio preview. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  try {
    const url = await startCheckout(await getRepo(), { kind: 'preview', projectId: id }, await req.json().catch(() => null), new URL(req.url).origin);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('preview checkout failed', err);
    return NextResponse.json({ error: 'The payment couldn’t start. Try again in a moment.' }, { status: 500 });
  }
}
