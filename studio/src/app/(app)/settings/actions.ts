'use server';

import { revalidatePath } from 'next/cache';
import { getRepo, requireUser } from '@/lib/auth';
import { settingsSchema } from '@/lib/schemas';
import type { StudioSettings } from '@/lib/types';

export async function saveSettingsAction(settings: StudioSettings): Promise<void> {
  await requireUser();
  await (await getRepo()).updateSettings(settingsSchema.parse(settings));
  revalidatePath('/settings');
}
