'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchSlug } from '@/lib/format';
import { siteConfigSchema } from '@/site/schema';
import { starterConfig } from '@/site/starter';
import {
  clientPatchSchema,
  newProjectSchema,
  projectPatchSchema,
  type ClientPatch,
  type ProjectPatch,
} from '@/lib/types';

export interface CreateState {
  errors?: Record<string, string>;
  message?: string;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? '');

export async function createProjectAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  await requireUser();
  const parsed = newProjectSchema.safeParse({
    name: str(form, 'name'),
    businessType: str(form, 'businessType'),
    siteType: str(form, 'siteType'),
    preset: str(form, 'preset'),
    headline: str(form, 'headline'),
    client: {
      ownerName: str(form, 'ownerName'),
      whatsapp: str(form, 'whatsapp'),
      instagram: str(form, 'instagram'),
      address: str(form, 'address'),
      notes: str(form, 'notes'),
    },
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[issue.path.length - 1]);
      errors[key] ??= issue.message;
    }
    return { errors };
  }
  const repo = await getRepo();
  const settings = await repo.getSettings();
  let id: string;
  try {
    const project = await repo.createProject(parsed.data, {
      pitchSlug: pitchSlug(parsed.data.name),
      pitchBanner: settings.bannerDefault,
    });
    id = project.id;
  } catch (err) {
    console.error('createProject failed', err);
    return { message: 'The project could not be saved. Try again.' };
  }
  revalidatePath('/');
  redirect(`/projects/${id}`);
}

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
