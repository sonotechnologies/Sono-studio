import 'server-only';
import { settingsStore } from '../notify-store';
import { escapeHtml, telegram, telegramToken, type Button } from '../telegram';
import type { Draft } from './types';

/*
 * Drafts on Telegram: each arrives with Approve, Edit and Skip. Approving
 * gives you a link that opens WhatsApp or Instagram with the message; the
 * bot never sends anything to a client itself.
 */

export function draftButtons(d: Pick<Draft, 'id' | 'kind'>): Button[][] {
  return [
    [
      { text: d.kind === 'checklist' ? '✅ Done' : '✅ Approve', data: `d:a:${d.id}` },
      ...(d.kind === 'checklist' ? [] : [{ text: '✏️ Edit', data: `d:e:${d.id}` }]),
      { text: 'Skip', data: `d:s:${d.id}` },
    ],
  ];
}

export function draftMessage(d: Pick<Draft, 'title' | 'why' | 'body' | 'channel' | 'recipient'>): string {
  const to = d.channel ? `\nTo ${escapeHtml(d.recipient)} on ${d.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'}` : '';
  return `📝 <b>${escapeHtml(d.title)}</b>${to}\n<i>${escapeHtml(d.why)}</i>\n\n${escapeHtml(d.body)}`;
}

/** Sends new drafts to your Telegram chat, if it's connected. Never throws. */
export async function pushDrafts(drafts: Draft[]): Promise<void> {
  const token = telegramToken();
  if (!token || !drafts.length) return;
  try {
    const chatId = (await (await settingsStore()).get()).telegramChatId;
    if (!chatId) return;
    const bot = telegram(token);
    for (const d of drafts) await bot.send(chatId, draftMessage(d), draftButtons(d));
  } catch (err) {
    console.warn('Sono AI: drafts not sent to Telegram:', (err as Error).message);
  }
}
