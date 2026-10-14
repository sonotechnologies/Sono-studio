import { after, NextResponse } from 'next/server';
import { sonoAiEnabled } from '@/sono-ai';
import { handleUpdate, validWebhook } from '@/sono-ai/bot';
import { telegram, telegramToken } from '@/sono-ai/telegram';

// An assistant answer (or a web search) can take a while.
export const maxDuration = 60;

/** Telegram's webhook for the Sono AI bot. Calls without the secret set at registration are refused. */
export async function POST(req: Request) {
  const token = telegramToken();
  if (!sonoAiEnabled() || !token || !validWebhook(req.headers.get('x-telegram-bot-api-secret-token'))) return new NextResponse(null, { status: 404 });
  const update = await req.json().catch(() => null);
  // Acknowledged at once so Telegram doesn't send the same update again; the answer follows.
  if (update)
    after(async () => {
      try {
        await handleUpdate(update, telegram(token));
      } catch (err) {
        console.warn('Sono AI: Telegram update not handled:', (err as Error).message);
      }
    });
  return NextResponse.json({ ok: true });
}
