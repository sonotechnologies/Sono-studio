'use server';

import { revalidatePath } from 'next/cache';
import { getRepo, requireUser } from '@/lib/auth';
import { copyEditsSchema, findSpots, tidy, type CopyEdit } from '@/mirror/edit';
import { filesOf } from '@/mirror/zip-files';

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

// Each copy's texts by page, kept while this server holds the copy, for "change it on every page".
const textIndex = new Map<string, Promise<Map<string, Set<string>>>>();

/** The other pages showing exactly this text (a phone number in the footer, a menu item). */
export async function pagesWithTextAction(projectId: string, text: string): Promise<string[]> {
  await requireUser();
  const repo = await getRepo();
  const meta = await repo.getSiteCopyMeta(projectId);
  if (!meta) return [];
  const key = `${projectId}:${meta.copiedAt}`;
  let index = textIndex.get(key);
  if (!index) {
    index = (async () => {
      const files = await filesOf(key, async () => (await repo.getSiteCopy(projectId))?.zip ?? null);
      const map = new Map<string, Set<string>>();
      for (const [path, data] of Object.entries(files ?? {})) {
        if (path.endsWith('.html')) map.set(path, new Set(findSpots(new TextDecoder().decode(data)).texts.map((t) => tidy(t.value))));
      }
      return map;
    })();
    textIndex.set(key, index);
    while (textIndex.size > 3) textIndex.delete(textIndex.keys().next().value!);
  }
  const want = tidy(text);
  return [...(await index)].filter(([, texts]) => texts.has(want)).map(([page]) => page);
}
