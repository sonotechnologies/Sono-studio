'use server';

import { revalidatePath } from 'next/cache';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchSlug } from '@/lib/format';
import { isBooking, isStore } from '@/generate/products';
import { sonoAiEnabled } from '@/sono-ai';
import { presetFor, toBrief } from '@/sono-ai/assist/build';
import { assistStore } from '@/sono-ai/assist/store';

/**
 * "Plan it": the request becomes an ordinary project and generation job, made
 * exactly as the New site wizard makes them, already running. The wizard's
 * screen then plans the site and waits for you to approve the plan; nothing
 * is built before that, and no pitch is sent.
 */
export async function startBuildAction(id: string): Promise<{ jobId?: string; error?: string }> {
  await requireUser();
  if (!sonoAiEnabled()) return { error: 'Sono AI is off.' };
  const assist = await assistStore();
  const build = (await assist.builds()).find((b) => b.id === id);
  if (!build) return { error: 'That build request is gone.' };
  if (build.status === 'discarded') return { error: 'That build request was discarded.' };
  if (build.status === 'started' && build.jobId) return { jobId: build.jobId };

  const repo = await getRepo();
  const [projects, rules, settings] = await Promise.all([repo.listProjects(), assist.rules(), repo.getSettings()]);
  const active = rules.filter((r) => r.enabled && r.confirmed).map((r) => r.text);
  const { preset } = presetFor(build.brief.businessType, projects, active);
  const brief = toBrief(build.brief, preset, active);
  const project = await repo.createProject(
    {
      name: brief.businessName,
      businessType: brief.businessType,
      siteType: isBooking(brief) ? 'booking' : isStore(brief) ? 'store' : 'showcase',
      preset: brief.preset,
      headline: '',
      client: { ...brief.client, notes: `Started by Sono AI from: “${build.request.slice(0, 300)}”` },
    },
    { pitchSlug: pitchSlug(brief.businessName), pitchBanner: settings.bannerDefault },
  );
  const job = await repo.createJob(project.id, brief);
  await repo.saveJob({ ...job, status: 'running', error: null });
  await assist.startBuild(build.id, project.id, job.id);
  revalidatePath('/');
  revalidatePath('/sono-ai/builds');
  return { jobId: job.id };
}

export async function discardBuildAction(id: string): Promise<void> {
  await requireUser();
  if (!sonoAiEnabled()) return;
  await (await assistStore()).discardBuild(id);
  revalidatePath('/sono-ai/builds');
}
