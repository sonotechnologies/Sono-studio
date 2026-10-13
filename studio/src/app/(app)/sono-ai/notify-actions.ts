'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getRepo, requireUser } from '@/lib/auth';
import { siteUrl } from '@/lib/format';
import { rebuildIndex, sonoAiEnabled } from '@/sono-ai';
import { webhookSecret } from '@/sono-ai/bot';
import { keyedStoreSignedIn, settingsStore } from '@/sono-ai/notify-store';
import { SUMMARY_KINDS, summaryMessage } from '@/sono-ai/summary';
import { telegram, telegramToken } from '@/sono-ai/telegram';

type Result = { ok?: string; error?: string; link?: string };

async function guard(): Promise<string | null> {
  await requireUser();
  return sonoAiEnabled() ? null : 'Sono AI is off. Set SONO_AI_ENABLED=true to turn it on.';
}
const fail = (err: unknown): Result => ({ error: (err as Error).message.slice(0, 300) });

/** Points the bot's webhook at this studio and makes a one-time link that connects your Telegram chat. */
export async function connectTelegramAction(): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  const token = telegramToken();
  if (!token) return { error: 'Add TELEGRAM_BOT_TOKEN in Vercel first (see the steps above), then redeploy.' };
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const origin = host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : siteUrl();
    const bot = telegram(token);
    await bot.setWebhook(`${origin}/api/sono-ai/telegram`, webhookSecret());
    const code = randomBytes(12).toString('base64url');
    await (await settingsStore()).setLinkCode(code, new Date(Date.now() + 15 * 60_000).toISOString());
    return { link: `https://t.me/${await bot.username()}?start=${code}` };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectTelegramAction(): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  await (await settingsStore()).update({ telegramChatId: null });
  revalidatePath('/sono-ai');
  return { ok: 'Disconnected. The bot will ignore your chat until you connect again.' };
}

export async function testTelegramAction(): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  const token = telegramToken();
  const chatId = (await (await settingsStore()).get()).telegramChatId;
  if (!token || !chatId) return { error: 'Connect Telegram first.' };
  try {
    await telegram(token).send(chatId, '👋 Test from Sono Studio. Alerts and the morning summary will arrive here.');
    return { ok: 'Sent. Check Telegram.' };
  } catch (err) {
    return fail(err);
  }
}

/** Sends the summary as it would look right now, without counting as today's. */
export async function sendSummaryNowAction(): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  const token = telegramToken();
  try {
    const facts = await (await keyedStoreSignedIn()).daily(false);
    if (!token || !facts?.chatId) return { error: 'Connect Telegram first.' };
    const msg = summaryMessage(facts, siteUrl());
    if (!msg) return { ok: 'Nothing worth your attention right now, so no message was sent. On a quiet morning you get nothing.' };
    await telegram(token).send(facts.chatId, msg.html, msg.buttons);
    return { ok: 'Sent. Check Telegram.' };
  } catch (err) {
    return fail(err);
  }
}

export async function setFollowUpDaysAction(days: number): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  if (!Number.isInteger(days) || days < 1 || days > 30) return { error: 'Pick between 1 and 30 days.' };
  await (await settingsStore()).update({ followUpDays: days });
  revalidatePath('/sono-ai');
  return { ok: 'Saved.' };
}

export async function unmuteAction(kind: string): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  const store = await settingsStore();
  const muted = (await store.get()).muted.filter((k) => k !== kind);
  await store.update({ muted });
  revalidatePath('/sono-ai');
  return { ok: `${SUMMARY_KINDS[kind as keyof typeof SUMMARY_KINDS] ?? kind} will be back in your summaries.` };
}

export async function rebuildIndexAction(): Promise<Result> {
  const off = await guard();
  if (off) return { error: off };
  try {
    const r = await rebuildIndex(await getRepo());
    revalidatePath('/sono-ai');
    return {
      ok: `${r.chunks} chunks: ${r.changed} updated, ${r.removed} removed, ${r.embedded} embedded${r.waiting ? `, ${r.waiting} waiting for an embedding` : ''}.`,
    };
  } catch (err) {
    return fail(err);
  }
}
