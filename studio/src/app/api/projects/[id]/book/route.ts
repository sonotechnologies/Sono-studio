import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';
import { PaymentError, startBooking } from '@/lib/checkout';

/** A test booking from the studio preview. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ url: await startBooking(await getRepo(), { kind: 'preview', projectId: id }, await req.json().catch(() => null), new URL(req.url).origin) });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('preview booking failed', err);
    return NextResponse.json({ error: 'The booking couldn’t start. Try again in a moment.' }, { status: 500 });
  }
}
