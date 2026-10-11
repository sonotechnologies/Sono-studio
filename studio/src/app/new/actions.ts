'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { BUSINESS_KINDS, briefSchema, type Asset, type Brief, type GenerationJob, type Plan } from '@/generate/brief';
import { fetchImage, LinkError } from '@/style/link';
import { importSite, type SiteImport } from '@/style/site-import';
import { cleanEditedPlan } from '@/generate/plan';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchSlug } from '@/lib/format';
import { SECTION_TYPES } from '@/site/registry';
import type { SectionType } from '@/site/schema';
import { isStore } from '@/generate/products';

async function jobFor(jobId: string): Promise<GenerationJob> {
  const job = await (await getRepo()).getJob(jobId);
  if (!job) throw new Error('This setup no longer exists');
  return job;
}

/** Keeps the project record (name, type, style, client) in step with the brief. */
async function syncProject(projectId: string, brief: Brief) {
  const repo = await getRepo();
  await repo.updateProject(projectId, { name: brief.businessName, businessType: brief.businessType, preset: brief.preset, siteType: isStore(brief) ? 'store' : 'showcase' });
  await repo.updateClient(projectId, {
    ownerName: brief.client.ownerName,
    whatsapp: brief.client.whatsapp,
    instagram: brief.client.instagram,
    address: brief.client.address,
  });
}

/** Step 1 done: the project and its setup job are created, so uploads have somewhere to go. */
export async function startWizardAction(input: Pick<Brief, 'businessName' | 'businessType' | 'pages'>): Promise<string> {
  await requireUser();
  const kind = BUSINESS_KINDS.find((k) => k.name === input.businessType);
  const brief = briefSchema.parse({
    businessName: input.businessName,
    businessType: input.businessType,
    pages: input.pages,
    preset: kind?.preset ?? 'warm-table',
    paste: '',
    client: { ownerName: '', whatsapp: '', instagram: '', address: '' },
    brandColors: [],
    useBrand: false,
  });
  const repo = await getRepo();
  const settings = await repo.getSettings();
  const project = await repo.createProject(
    {
      name: brief.businessName,
      businessType: brief.businessType,
      siteType: isStore(brief) ? 'store' : 'showcase',
      preset: brief.preset,
      headline: '',
      client: { ownerName: '', whatsapp: '', instagram: '', address: '', notes: '' },
    },
    { pitchSlug: pitchSlug(brief.businessName), pitchBanner: settings.bannerDefault },
  );
  const job = await repo.createJob(project.id, brief);
  revalidatePath('/');
  return job.id;
}

export async function saveBriefAction(jobId: string, brief: Brief): Promise<void> {
  await requireUser();
  const job = await jobFor(jobId);
  if (job.status !== 'draft' && job.status !== 'failed') throw new Error('Generation has already started');
  const clean = briefSchema.parse(brief);
  await (await getRepo()).saveJob({ ...job, brief: clean });
  await syncProject(job.projectId, clean);
  revalidatePath('/');
}

/** Generate, or retry after a failure; a retry picks up at the step that failed. */
export async function startGenerationAction(jobId: string): Promise<void> {
  await requireUser();
  const job = await jobFor(jobId);
  if (job.status === 'running' || job.status === 'done' || job.status === 'plan_review') return;
  await (await getRepo()).saveJob({ ...job, status: 'running', error: null });
}

/** Back from the plan to the form: the plan and anything read from the notes are redone. */
export async function reopenBriefAction(jobId: string): Promise<void> {
  await requireUser();
  const job = await jobFor(jobId);
  if (job.status === 'done') throw new Error('This site has already been generated');
  await (await getRepo()).saveJob({ ...job, status: 'draft', extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null });
}

const editedPlanSchema = z.object({
  pages: z.array(
    z.object({
      id: z.string(),
      sections: z
        .array(
          z.object({
            id: z.string().max(80),
            type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]),
            variant: z.string().max(40),
            note: z.string().max(200),
          }),
        )
        .max(12),
    }),
  ),
});

/** The reviewed plan replaces the model's, keeping the pages it was asked for. */
export async function approvePlanAction(jobId: string, edited: z.infer<typeof editedPlanSchema>): Promise<void> {
  await requireUser();
  const job = await jobFor(jobId);
  if (job.status !== 'plan_review' || !job.plan) throw new Error('There is no plan waiting for review');
  const input = editedPlanSchema.parse(edited);
  const merged: Plan = {
    pages: job.plan.pages.map((p) => ({ ...p, sections: input.pages.find((e) => e.id === p.id)?.sections ?? p.sections })),
  };
  await (await getRepo()).saveJob({ ...job, plan: cleanEditedPlan(merged, job.brief), status: 'running', error: null });
}

export interface ImportResult {
  error?: string;
  site?: Omit<SiteImport, 'photos' | 'logo'>;
  /** Photos and logo copied into the project, ready to place. */
  assets?: Asset[];
  skippedPhotos?: number;
}

/**
 * Imports the client's current website into this setup: its text, contact
 * details, pages, photos and logo. Only for sites the client owns.
 */
export async function importSiteAction(jobId: string, url: string, confirmed: boolean): Promise<ImportResult> {
  await requireUser();
  if (!confirmed) return { error: 'Tick the box to confirm the site belongs to your client.' };
  const job = await jobFor(jobId);
  let site: SiteImport;
  try {
    site = await importSite(url.trim().slice(0, 500));
  } catch (err) {
    if (!(err instanceof LinkError)) console.error('site import failed', err);
    return { error: err instanceof LinkError ? err.message : 'That site couldn’t be read. Check the address, or paste its text instead.' };
  }
  const repo = await getRepo();
  const assets: Asset[] = [];
  let skipped = 0;
  const wanted = [...(site.logo ? [{ ...site.logo, kind: 'logo' as const }] : []), ...site.photos.map((p) => ({ ...p, kind: 'photo' as const }))];
  // A few at a time: fast enough, and polite to the client's server.
  for (let i = 0; i < wanted.length; i += 4) {
    const batch = await Promise.all(wanted.slice(i, i + 4).map(async (img) => ({ img, file: await fetchImage(img.src) })));
    for (const { img, file } of batch) {
      if (!file || (file.ext === 'svg' && img.kind !== 'logo')) {
        skipped++;
        continue;
      }
      if (img.kind === 'logo') for (const a of await repo.listAssets(job.projectId)) if (a.kind === 'logo') await repo.deleteAsset(job.projectId, a.id);
      assets.push(
        await repo.addAsset(job.projectId, { kind: img.kind, source: 'upload', alt: (img.alt || site.businessName).slice(0, 200), credit: '', width: null, height: null }, file),
      );
    }
  }
  const { photos: _p, logo: _l, ...rest } = site;
  return { site: rest, assets, skippedPhotos: skipped };
}
