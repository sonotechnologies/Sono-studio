import 'server-only';
import { AllProvidersFailed } from '@/ai/router';
import { escapeHtml, type Button, type Telegram } from '../telegram';
import { approveHref, followUpDrafts } from './drafts';
import { briefSummary, extractBuild } from './build';
import { answer } from './engine';
import { QUOTA_NOTE } from './reserve';
import { draftButtons, draftMessage } from './telegram-drafts';
import { draftFromRow, tgDeps, type TgBackend } from './telegram-assist';
import type { Draft } from './types';

/*
 * Talking to Sono AI on Telegram: the same answers as in the studio, rules
 * confirmed with a button, 👍/👎 on each answer, and drafts approved, edited
 * or skipped with buttons. Approving gives you a link that opens WhatsApp or
 * Instagram with the message; the bot never contacts a client itself.
 */

const MAX = 3900;
const clip = (s: string) => (s.length > MAX ? `${s.slice(0, MAX)}…` : s);

/** Where to send an approved draft from, as a Telegram message. */
function approvedMessage(d: Draft): string {
  const text = d.finalBody ?? d.body;
  const href = approveHref(d);
  if (d.kind === 'checklist') return `✅ ${escapeHtml(d.title)}: marked done.`;
  if (d.channel === 'whatsapp' && href) return `✅ Approved. <a href="${href}">Open WhatsApp with the message</a> and press send.`;
  if (d.channel === 'instagram' && href) return `✅ Approved. Copy the message below, then <a href="${href}">open the Instagram chat</a>.\n\n<code>${escapeHtml(text)}</code>`;
  return `✅ Approved. Copy it from here:\n\n<code>${escapeHtml(text)}</code>`;
}

/** A message from your chat (already checked to be yours). */
export async function ownerMessage(chatId: number, text: string, bot: Telegram, backend: TgBackend): Promise<void> {
  const state = await backend.state();
  if (!state) return;

  // Waiting for your edited text for a draft.
  if (state.editingDraft) {
    if (/^\/cancel\b/i.test(text.trim())) {
      await backend.write({ op: 'draft', args: { id: state.editingDraft, decision: 'cancel_edit' } });
      await bot.send(chatId, 'Edit cancelled. The draft is still waiting in the studio.');
      return;
    }
    const row = await backend.write<Parameters<typeof draftFromRow>[0]>({ op: 'draft', args: { id: state.editingDraft, decision: 'approved', body: text.trim() } });
    await bot.send(chatId, row ? approvedMessage(draftFromRow(row)) : 'That draft was already handled.');
    return;
  }

  await backend.write({ op: 'message', args: { role: 'user', text, mode: null } });
  const { deps, draftDeps } = tgDeps(state, backend);
  const say = async (reply: string, mode: string | null, buttons: (id: string) => Button[][] = () => [], sources: { label: string; href: string }[] = []) => {
    const saved = await backend.write<{ id: string }>({ op: 'message', args: { role: 'assistant', text: reply, mode, sources } });
    const links = sources.length ? `\n\n${sources.map((s) => `<a href="${s.href}">${escapeHtml(s.label)}</a>`).join(' · ')}` : '';
    await bot.send(chatId, clip(escapeHtml(reply)) + links, saved ? buttons(saved.id) : []);
  };

  try {
    const a = await answer(text, deps);
    if (a.kind === 'rule') {
      const rule = await backend.write<{ id: string }>({ op: 'rule', args: { text: a.rule } });
      return say(a.reply, 'rule', () => (rule ? [[{ text: '💾 Save rule', data: `rule:${rule.id}` }]] : []));
    }
    if (a.kind === 'draft') {
      if (a.ask.kind !== 'follow_up') return say(`Quotes and handover checklists are made in the studio: ${deps.studioUrl}/sono-ai/drafts`, 'draft');
      const rows = await followUpDrafts(draftDeps, state.pendingFollowUps.map((projectId) => ({ kind: 'follow_up', status: 'pending', projectId }) as Draft));
      if (!rows.length) return say('No pitch needs a follow-up right now, or one is already waiting for you.', 'draft');
      const saved = (await backend.write<Parameters<typeof draftFromRow>[0][]>({ op: 'add_drafts', args: { rows } })) ?? [];
      await say(`Here ${saved.length === 1 ? 'is a follow-up' : `are ${saved.length} follow-ups`} to approve, edit or skip.`, 'draft');
      for (const d of saved.map(draftFromRow)) await bot.send(chatId, clip(draftMessage(d)), draftButtons(d));
      return;
    }
    if (a.kind === 'build') {
      const brief = await extractBuild(text, state.history, deps);
      if ('missing' in brief) return say(brief.missing, 'build');
      const id = await backend.write<string>({ op: 'build', args: { request: text, brief } });
      if (!id) return say('I couldn’t save that build request. Try again in the studio.', 'build');
      return say(`Here’s the brief I’d start from:\n\n${briefSummary(brief)}\n\nNothing is built yet. Open it in the studio to plan the site; you’ll review the plan before anything is built.`, 'build', () => [
        [{ text: '🧭 Plan it in the studio', url: `${deps.studioUrl}/sono-ai/builds/${id}` }],
      ]);
    }
    return say(a.reply, a.mode, (id) => [[{ text: '👍', data: `fb:u:${id}` }, { text: '👎', data: `fb:d:${id}` }]], a.sources);
  } catch (err) {
    return say(err instanceof AllProvidersFailed && !err.attempts.length ? QUOTA_NOTE : `I couldn’t answer that: ${(err as Error).message.slice(0, 300)}`, null);
  }
}

/** A button on one of the assistant's messages. Returns false if it isn't one of ours. */
export async function assistButton(chatId: number, queryId: string, data: string, bot: Telegram, backend: TgBackend): Promise<boolean> {
  const rule = /^rule:([0-9a-f-]{36})$/.exec(data);
  if (rule) {
    const saved = await backend.write<{ id: string | null; text: string | null }>({ op: 'confirm_rule', args: { id: rule[1] } });
    await bot.answerCallback(queryId, saved?.id ? 'Saved to your rulebook.' : 'That rule is gone.');
    return true;
  }
  const fb = /^fb:([ud]):([0-9a-f-]{36})$/.exec(data);
  if (fb) {
    await backend.write({ op: 'feedback', args: { kind: 'reply', id: fb[2], rating: fb[1] === 'u' ? 1 : -1 } });
    await bot.answerCallback(queryId, fb[1] === 'u' ? 'Thanks!' : 'Thanks, noted.');
    return true;
  }
  const d = /^d:([aes]):([0-9a-f-]{36})$/.exec(data);
  if (d) {
    const decision = d[1] === 'a' ? 'approved' : d[1] === 's' ? 'skipped' : 'editing';
    const row = await backend.write<Parameters<typeof draftFromRow>[0]>({ op: 'draft', args: { id: d[2], decision } });
    const draft = row ? draftFromRow(row) : null;
    if (!draft || (decision !== 'editing' && draft.status !== decision) || (decision === 'editing' && draft.status !== 'pending')) {
      await bot.answerCallback(queryId, 'That draft was already handled.');
      return true;
    }
    if (decision === 'approved') {
      await bot.answerCallback(queryId, 'Approved');
      await bot.send(chatId, approvedMessage(draft));
    } else if (decision === 'skipped') {
      await bot.answerCallback(queryId, 'Skipped');
    } else {
      await bot.answerCallback(queryId, 'Send me the new text');
      await bot.send(chatId, `Send me the new text for “${escapeHtml(draft.title)}” as your next message, or /cancel.\n\n<code>${escapeHtml(draft.body)}</code>`);
    }
    return true;
  }
  return false;
}
