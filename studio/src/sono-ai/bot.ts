import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { serverSecret } from '@/lib/crypto';
import { siteUrl } from '@/lib/format';
import { keyedStore, type KeyedStore } from './notify-store';
import { SUMMARY_KINDS, summaryMessage, type SummaryKind } from './summary';
import { telegram, telegramToken, type Telegram } from './telegram';

/*
 * The Telegram side of Sono AI: the webhook (linking your chat, thumbs-down on
 * summary items) and the morning summary. The bot answers only your chat;
 * everything else is ignored without a reply.
 */

/** Telegram sends this with every webhook call; it's set when the webhook is registered. */
export const webhookSecret = () => serverSecret('telegram').slice(0, 64);

export function validWebhook(header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(webhookSecret());
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Update {
  message?: { chat: { id: number; type: string }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

export async function handleUpdate(update: Update, bot: Telegram, store: KeyedStore = keyedStore()): Promise<void> {
  if (update.callback_query) {
    const q = update.callback_query;
    const chatId = q.message?.chat.id;
    const kind = q.data?.startsWith('mute:') ? (q.data.slice(5) as SummaryKind) : null;
    if (!chatId || !kind || !(kind in SUMMARY_KINDS)) return;
    if (await store.mute(chatId, kind)) await bot.answerCallback(q.id, `Got it. “${SUMMARY_KINDS[kind]}” will be left out of your summaries. Bring it back on the Sono AI page.`);
    return;
  }
  const m = update.message;
  if (!m?.text || m.chat.type !== 'private') return;
  const start = /^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?$/.exec(m.text.trim());
  if (start?.[1]) {
    if (await store.linkTelegram(start[1], m.chat.id))
      await bot.send(m.chat.id, '✅ Connected. I’ll send alerts here as things happen, and a summary each morning when there’s something worth your attention.');
    return;
  }
  // Anything else: only your chat gets an answer.
  if ((await store.chat()) !== m.chat.id) return;
  await bot.send(m.chat.id, 'For now I send alerts and the morning summary. Questions and drafts come in the next stage.');
}

/** Sends today's summary once. Returns what happened, for the cron log. */
export async function sendDailySummary(store: KeyedStore = keyedStore(), bot?: Telegram): Promise<'sent' | 'quiet' | 'skipped'> {
  const token = telegramToken();
  if (!token && !bot) return 'skipped';
  const facts = await store.daily(true);
  if (!facts?.chatId) return 'skipped';
  const msg = summaryMessage(facts, siteUrl());
  if (!msg) return 'quiet';
  await (bot ?? telegram(token!)).send(facts.chatId, msg.html, msg.buttons);
  return 'sent';
}
