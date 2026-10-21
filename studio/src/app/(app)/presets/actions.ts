'use server';

import { revalidatePath } from 'next/cache';
import { getRepo, requireUser } from '@/lib/auth';
import type { CustomStyle } from '@/lib/data/repo';
import { themeSchema, type SiteTheme } from '@/site/schema';
import { LinkError, readLink } from '@/style/link';
import { styleFromReference, type ReferenceStyle } from '@/style/reference';

export async function saveStyleAction(input: { id?: string; name: string; note: string; theme: SiteTheme }): Promise<{ style?: CustomStyle; error?: string }> {
  await requireUser();
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: 'Give the style a name.' };
  const theme = themeSchema.safeParse(input.theme);
  if (!theme.success) return { error: 'Some of the style’s values aren’t valid. Check the colours.' };
  const style = await (await getRepo()).saveStyle({ id: input.id, name, note: input.note.trim().slice(0, 200), theme: theme.data });
  revalidatePath('/presets');
  return { style };
}

export async function deleteStyleAction(id: string): Promise<void> {
  await requireUser();
  await (await getRepo()).deleteStyle(id);
  revalidatePath('/presets');
}

/** Reads a web page's colours and fonts and turns them into a style. No AI involved. */
export async function readLinkAction(url: string): Promise<{ style?: ReferenceStyle; title?: string; error?: string }> {
  await requireUser();
  try {
    const ref = await readLink(url.trim().slice(0, 500));
    return { style: styleFromReference(ref), title: ref.title };
  } catch (err) {
    return { error: err instanceof LinkError ? err.message : 'That page couldn’t be read. Try a screenshot instead.' };
  }
}
