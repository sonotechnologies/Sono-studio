import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sonoAiEnabled } from '@/sono-ai';
import { sendDailySummary } from '@/sono-ai/bot';

/**
 * The morning summary, run by Vercel Cron (see vercel.json). Vercel sends
 * CRON_SECRET as a bearer token; anything else is refused. A summary goes
 * at most once a day, and not at all on a quiet day.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse(null, { status: 401 });
  if (!sonoAiEnabled()) return NextResponse.json({ result: 'off' });
  try {
    return NextResponse.json({ result: await sendDailySummary() });
  } catch (err) {
    console.error('Sono AI summary failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
