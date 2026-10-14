/*
 * A small Telegram Bot API client. The bot token stays on the server
 * (TELEGRAM_BOT_TOKEN); the webhook only accepts calls carrying the secret
 * set when it was registered, and messages only from your linked chat.
 */

type Fetch = typeof fetch;

/** A button that sends `data` back to the bot, or opens `url`. */
export type Button = { text: string; data: string; url?: undefined } | { text: string; url: string; data?: undefined };

export interface Telegram {
  send(chatId: number, html: string, buttons?: Button[][]): Promise<void>;
  answerCallback(id: string, text: string): Promise<void>;
  setWebhook(url: string, secret: string): Promise<void>;
  username(): Promise<string>;
}

export class TelegramError extends Error {}

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function telegram(token: string, f: Fetch = fetch, base = process.env.SONO_TELEGRAM_API_URL || 'https://api.telegram.org'): Telegram {
  const call = async <T>(method: string, body: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await f(`${base}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new TelegramError(`Telegram could not be reached: ${(err as Error).message}`);
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) throw new TelegramError(`Telegram refused ${method}: ${data.description ?? res.status}`);
    return data.result as T;
  };
  return {
    async send(chatId, html, buttons) {
      await call('sendMessage', {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } } : {}),
      });
    },
    async answerCallback(id, text) {
      await call('answerCallbackQuery', { callback_query_id: id, text });
    },
    async setWebhook(url, secret) {
      await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    },
    async username() {
      return (await call<{ username: string }>('getMe', {})).username;
    },
  };
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
