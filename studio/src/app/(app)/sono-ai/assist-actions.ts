'use server';

import { revalidatePath } from 'next/cache';
import { AllProvidersFailed } from '@/ai/router';
import { getRepo, requireUser } from '@/lib/auth';
import { siteConfigSchema } from '@/site/schema';
import { defer, sonoAiEnabled } from '@/sono-ai';
import { approveHref, checklistDraft, followUpDrafts, quoteDraft, type DraftDeps } from '@/sono-ai/assist/drafts';
import { answer, type AnswerOptions } from '@/sono-ai/assist/engine';
import { QUOTA_NOTE } from '@/sono-ai/assist/reserve';
import { recalcScorecards, sessionAssist } from '@/sono-ai/assist/session';
import { assistStore, type AssistStore } from '@/sono-ai/assist/store';
import { pushDrafts } from '@/sono-ai/assist/telegram-drafts';
import type { Draft, DraftDecision, Message, Mode } from '@/sono-ai/assist/types';

type Off = { error: string };

async function guard(): Promise<Off | null> {
  await requireUser();
  return sonoAiEnabled() ? null : { error: 'Sono AI is off. Set SONO_AI_ENABLED=true to turn it on.' };
}

function problem(err: unknown): string {
  if (err instanceof AllProvidersFailed) return err.attempts.length ? `Sono AI couldn’t answer: ${err.message}` : QUOTA_NOTE;
  return `Sono AI couldn’t answer: ${(err as Error).message.slice(0, 300)}`;
}

export interface AskResult {
  messages?: Message[];
  /** A rule waiting for you to confirm it. */
  ruleId?: string;
  error?: string;
}

/** One message to Sono AI, from the full-page chat or the workspace tab. */
export async function askAction(text: string, opts: { mode?: Mode | 'auto'; projectId?: string | null } = {}): Promise<AskResult> {
  const off = await guard();
  if (off) return off;
  const message = text.trim().slice(0, 2000);
  if (!message) return { error: 'Type a message first.' };
  const repo = await getRepo();
  const { deps, draftDeps, assist, snapshot } = await sessionAssist(repo, opts.projectId ?? null);
  const projectId = opts.projectId ?? null;
  const asked = await assist.addMessage({ projectId, channel: 'studio', role: 'user', text: message, mode: null, sources: [] });
  const reply = (text: string, mode: Message['mode'], sources: Message['sources'] = []) => assist.addMessage({ projectId, channel: 'studio', role: 'assistant', text, mode, sources });

  try {
    const a = await answer(message, deps, opts as AnswerOptions);
    if (a.kind === 'rule') {
      const rule = await assist.addRule(a.rule, 'studio');
      return { messages: [asked, await reply(a.reply, 'rule')], ruleId: rule.id };
    }
    if (a.kind === 'draft') {
      const snap = await snapshot();
      const named = snap.projects.find((p) => message.toLowerCase().includes(p.name.toLowerCase())) ?? snap.projects.find((p) => p.id === projectId);
      const drafts = await makeDrafts(a.ask.kind, named?.id ?? null, draftDeps, assist);
      if ('error' in drafts) return { messages: [asked, await reply(drafts.error, 'draft')] };
      const note = drafts.list.length
        ? `${drafts.list.length === 1 ? `Drafted: “${drafts.list[0].title}”.` : `I drafted ${drafts.list.length} ${a.ask.kind === 'follow_up' ? 'follow-ups' : 'drafts'}.`} Review ${drafts.list.length === 1 ? 'it' : 'them'} and approve, edit or skip.`
        : 'No pitch needs a follow-up right now, or one is already waiting for you.';
      return { messages: [asked, await reply(note, 'draft', drafts.list.length ? [{ label: 'Drafts', href: '/sono-ai/drafts' }] : [])] };
    }
    return { messages: [asked, await reply(a.reply, a.mode, a.sources)] };
  } catch (err) {
    return { messages: [asked, await reply(problem(err), null)] };
  }
}

async function makeDrafts(
  kind: Draft['kind'],
  projectId: string | null,
  draftDeps: () => Promise<DraftDeps>,
  assist: AssistStore,
): Promise<{ list: Draft[] } | { error: string }> {
  const d = await draftDeps();
  if (kind === 'follow_up') {
    const rows = await followUpDrafts(d, await assist.drafts('pending'));
    const list = await assist.addDrafts(rows);
    defer(() => pushDrafts(list));
    return { list };
  }
  const project = d.snapshot.projects.find((p) => p.id === projectId);
  if (!project) return { error: `Which project? Open it in the workspace and ask there, or name it, for example “draft a ${kind === 'quote' ? 'quote' : 'handover checklist'} for ${d.snapshot.projects[0]?.name ?? 'Kora Kitchen'}”.` };
  const version = await (await getRepo()).getSiteVersion(project.id);
  const parsed = version ? siteConfigSchema.safeParse(version.config) : null;
  const config = parsed?.success ? parsed.data : null;
  if (kind === 'checklist') {
    if (!config) return { error: `${project.name} has no site yet, so there’s nothing to hand over.` };
    const list = await assist.addDrafts([checklistDraft(project, config)]);
    defer(() => pushDrafts(list));
    return { list };
  }
  const past = (await assist.drafts('approved')).filter((x) => x.kind === 'quote').map((x) => x.finalBody ?? x.body);
  const list = await assist.addDrafts([await quoteDraft(d, project, config, past)]);
  defer(() => pushDrafts(list));
  return { list };
}

export async function draftAction(kind: Draft['kind'], projectId: string | null): Promise<{ ok?: string; error?: string }> {
  const off = await guard();
  if (off) return off;
  try {
    const { draftDeps, assist, deps } = await sessionAssist(await getRepo(), projectId);
    if (!deps.providers.length && kind !== 'checklist') return { error: QUOTA_NOTE };
    const r = await makeDrafts(kind, projectId, draftDeps, assist);
    revalidatePath('/sono-ai/drafts');
    if ('error' in r) return r;
    return { ok: r.list.length ? `${r.list.length} draft${r.list.length === 1 ? '' : 's'} ready below.` : 'No pitch needs a follow-up right now, or one is already waiting.' };
  } catch (err) {
    return { error: problem(err) };
  }
}

/** Approve (optionally with your edited text) or skip. Approving returns where to send it from. */
export async function decideDraftAction(id: string, decision: DraftDecision, body?: string): Promise<{ href?: string | null; text?: string; error?: string }> {
  const off = await guard();
  if (off) return off;
  const assist = await assistStore();
  const current = (await assist.drafts('pending')).find((d) => d.id === id);
  if (!current) return { error: 'That draft was already handled.' };
  const edited = body !== undefined && body.trim() && body.trim() !== current.body.trim() ? body.trim() : undefined;
  const d = await assist.decideDraft(id, decision, edited);
  revalidatePath('/sono-ai/drafts');
  if (!d) return { error: 'That draft was already handled.' };
  return decision === 'approved' ? { href: approveHref(d), text: d.finalBody ?? d.body } : {};
}

export async function confirmRuleAction(id: string): Promise<{ ok?: string; error?: string }> {
  const off = await guard();
  if (off) return off;
  const r = await (await assistStore()).updateRule(id, { confirmed: true, enabled: true });
  revalidatePath('/sono-ai/rules');
  return r ? { ok: 'Saved to your rulebook.' } : { error: 'That rule is gone.' };
}

export async function addRuleAction(text: string): Promise<{ ok?: string; error?: string }> {
  const off = await guard();
  if (off) return off;
  const t = text.trim();
  if (t.length < 3) return { error: 'Write the rule first.' };
  const assist = await assistStore();
  const r = await assist.addRule(t, 'studio');
  await assist.updateRule(r.id, { confirmed: true });
  revalidatePath('/sono-ai/rules');
  return { ok: 'Saved.' };
}

export async function setRuleEnabledAction(id: string, enabled: boolean): Promise<void> {
  if (await guard()) return;
  await (await assistStore()).updateRule(id, { enabled });
  revalidatePath('/sono-ai/rules');
}

export async function deleteRuleAction(id: string): Promise<void> {
  if (await guard()) return;
  await (await assistStore()).deleteRule(id);
  revalidatePath('/sono-ai/rules');
}

export async function feedbackAction(kind: 'reply' | 'draft', id: string, rating: 1 | -1): Promise<void> {
  if (await guard()) return;
  await (await assistStore()).setFeedback(kind, id, rating);
}

export async function recalcScorecardsAction(): Promise<{ ok?: string; error?: string }> {
  const off = await guard();
  if (off) return off;
  const rows = await recalcScorecards(await assistStore());
  revalidatePath('/sono-ai/scorecards');
  return { ok: `Recalculated ${rows.length} rows.` };
}
