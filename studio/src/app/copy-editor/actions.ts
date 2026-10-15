'use server';

import { revalidatePath } from 'next/cache';
import { AllProvidersFailed, runJson } from '@/ai/router';
import { loadProviders, routerHooks } from '@/ai/service';
import { getRepo, requireUser } from '@/lib/auth';
import { copyEditsSchema, findSpots, tidy, type CopyEdit } from '@/mirror/edit';
import { aiEdits, copyAiPrompt, copyAiReplySchema } from '@/mirror/ai';
import { copyPages } from '@/mirror/files';

/** Saves every change made in the editor (the whole list, replacing the last). */
export async function saveCopyEditsAction(projectId: string, edits: CopyEdit[]): Promise<{ editedAt?: string; error?: string }> {
  await requireUser();
  const parsed = copyEditsSchema.safeParse(edits);
  if (!parsed.success) return { error: 'Those changes couldn’t be read. Reload the editor and try again.' };
  try {
    const meta = await (await getRepo()).saveSiteCopyEdits(projectId, parsed.data);
    if (!meta) return { error: 'This project has no site copy.' };
    revalidatePath(`/projects/${projectId}`);
    return { editedAt: meta.editedAt };
  } catch (err) {
    return { error: `Couldn’t save: ${(err as Error).message.slice(0, 200)}` };
  }
}

/** The other pages showing exactly this text (a phone number in the footer, a menu item). */
export async function pagesWithTextAction(projectId: string, text: string): Promise<string[]> {
  await requireUser();
  const repo = await getRepo();
  const meta = await repo.getSiteCopyMeta(projectId);
  if (!meta) return [];
  const pages = await copyPages(projectId, meta.copiedAt, async () => (await repo.getSiteCopy(projectId))?.zip ?? null);
  const want = tidy(text);
  return Object.entries(pages)
    .filter(([, html]) => findSpots(html).texts.some((t) => tidy(t.value) === want))
    .map(([page]) => page);
}

export interface CopyAiResult {
  reply?: string;
  /** Every change after the AI's, already saved. */
  edits?: CopyEdit[];
  /** What the AI changed, for undo. */
  added?: number;
  error?: string;
}

/**
 * Asks AI to change the page being edited ("change the phone number to … on
 * every page", "make the headline shorter"). Its changes are saved as editor
 * edits, so the layout stays as copied and each one can be undone.
 */
export async function copyAiAction(
  projectId: string,
  input: { page: string; message: string; selected: number[]; edits: CopyEdit[]; history: { role: 'user' | 'assistant'; text: string }[] },
): Promise<CopyAiResult> {
  await requireUser();
  const message = input.message.trim().slice(0, 1500);
  if (!message) return { error: 'Type what you’d like changed.' };
  const parsed = copyEditsSchema.safeParse(input.edits);
  if (!parsed.success) return { error: 'Your changes couldn’t be read. Reload the editor and try again.' };
  const repo = await getRepo();
  const meta = await repo.getSiteCopyMeta(projectId);
  if (!meta) return { error: 'This project has no site copy.' };
  const pages = await copyPages(projectId, meta.copiedAt, async () => (await repo.getSiteCopy(projectId))?.zip ?? null);
  const html = pages[input.page];
  if (!html) return { error: 'That page isn’t in the copy.' };
  const title = meta.pages.find((p) => p.path === input.page)?.title ?? input.page;
  try {
    const { system, prompt } = copyAiPrompt({ page: input.page, title, html, edits: parsed.data, message, selected: input.selected.slice(0, 40), history: input.history });
    const providers = await loadProviders(repo, { projectId });
    const r = await runJson(providers, { task: 'chat', system, prompt, temperature: 0.3, demo: { kind: 'copy' } }, copyAiReplySchema, routerHooks(repo));
    const result = aiEdits(input.page, html, parsed.data, r.data);
    if (result.added.length) {
      const saved = await repo.saveSiteCopyEdits(projectId, result.edits);
      if (!saved) return { error: 'This project has no site copy.' };
      revalidatePath(`/projects/${projectId}`);
    }
    const note = result.dropped ? ` (${result.dropped} suggested change${result.dropped === 1 ? '' : 's'} couldn’t be used.)` : '';
    return { reply: `${r.data.reply.trim() || (result.added.length ? 'Done.' : 'Nothing changed.')}${note}`, edits: result.edits, added: result.added.length };
  } catch (err) {
    return { error: err instanceof AllProvidersFailed ? err.message : `Something went wrong: ${(err as Error).message.slice(0, 300)}` };
  }
}
