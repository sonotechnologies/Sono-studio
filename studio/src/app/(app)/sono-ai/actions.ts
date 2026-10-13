'use server';

import { revalidatePath } from 'next/cache';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { backfill, type BackfillResult } from '@/sono-ai/backfill';
import { getStore } from '@/sono-ai/store';

/** Imports past history into the knowledge bank and links outcomes. Safe to run again. */
export async function importHistoryAction(): Promise<{ result?: BackfillResult; error?: string }> {
  await requireUser();
  if (!sonoAiEnabled()) return { error: 'Sono AI is off. Set SONO_AI_ENABLED=true to turn it on.' };
  try {
    const result = await backfill(await getRepo(), await getStore());
    revalidatePath('/sono-ai');
    return { result };
  } catch (err) {
    return { error: (err as Error).message.slice(0, 300) };
  }
}
