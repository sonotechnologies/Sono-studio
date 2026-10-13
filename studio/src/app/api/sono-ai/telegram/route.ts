import { NextResponse } from 'next/server';
import { sonoAiEnabled } from '@/sono-ai';
import { handleUpdate, validWebhook } from '@/sono-ai/bot';
import { telegram, telegramToken } from '@/sono-ai/telegram';

/** Telegram's webhook for the Sono AI bot. Calls without the secret set at registration are refused. */
export async function POST(req: Request) {
  const token = telegramToken();
  if (!sonoAiEnabled() || !token || !validWebhook(req.headers.get('x-telegram-bot-api-secret-token'))) return new NextResponse(null, { status: 404 });
  try {
    await handleUpdate(await req.json(), telegram(token));
  } catch (err) {
    console.warn('Sono AI: Telegram update not handled:', (err as Error).message);
  }
  // Always 200, so Telegram doesn't retry the same update.
  return NextResponse.json({ ok: true });
}
