'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getRepo, requireUser } from '@/lib/auth';
import { siteConfigSchema } from '@/site/schema';
import { starterConfig } from '@/site/starter';
import {
  clientPatchSchema,
  projectPatchSchema,
  type ClientPatch,
  type ProjectPatch,
} from '@/lib/types';

export async function updateProjectAction(id: string, patch: ProjectPatch): Promise<void> {
  await requireUser();
  await (await getRepo()).updateProject(id, projectPatchSchema.parse(patch));
  revalidatePath('/');
  revalidatePath(`/projects/${id}`);
}

export async function updateClientAction(id: string, patch: ClientPatch): Promise<void> {
  await requireUser();
  await (await getRepo()).updateClient(id, clientPatchSchema.parse(patch));
  revalidatePath('/');
  revalidatePath(`/projects/${id}`);
}

export async function deleteProjectAction(id: string): Promise<void> {
  await requireUser();
  await (await getRepo()).deleteProject(id);
  revalidatePath('/');
}

/** Builds version 1 from the project record so there is a site to preview before the AI pipeline exists. */
export async function createStarterSiteAction(id: string): Promise<void> {
  await requireUser();
  const repo = await getRepo();
  const project = await repo.getProject(id);
  if (!project) throw new Error('Project not found');
  if (!(await repo.getSiteVersion(id))) {
    await repo.saveSiteVersion(id, siteConfigSchema.parse(starterConfig(project)), 'Starter site');
  }
  revalidatePath('/');
  revalidatePath(`/projects/${id}`);
  redirect(`/preview/${id}`);
}
