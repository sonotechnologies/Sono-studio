import { alertGenerationFailed } from '@/sono-ai/alerts';
import { NextResponse } from 'next/server';
import { availability, healModels, isAiProvider, retiredModels, loadProviders, loadStock, routerHooks } from '@/ai/service';
import { advance } from '@/generate/pipeline';
import { getRepo, getUser } from '@/lib/auth';
import { siteConfigSchema } from '@/site/schema';

// One unit of work is one AI request (plus a possible repair), well inside this.
// A step can include a retry after a provider's server error.
export const maxDuration = 120;

/** Runs the next step of a generation job and returns the updated job. The browser calls this in a loop. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  const repo = await getRepo();
  const job = await repo.getJob(id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status !== 'running') return NextResponse.json({ job });
  // Another request (another tab, a reload) is already running this step: the browser asks again shortly.
  if (!(await repo.claimJob(id, maxDuration + 10))) return NextResponse.json({ job, busy: true });

  const providers = await loadProviders(repo, { projectId: job.projectId });
  if (!providers.length) {
    const rows = (await repo.listProviderKeys()).filter((r) => isAiProvider(r.provider));
    const message = rows.length
      ? `Every AI provider is cooling down or at today's limit (${rows.map((r) => `${r.provider}: ${availability(r)}`).join(', ')}). Try again in a few minutes, or add another provider in Settings → AI providers.`
      : 'No AI provider is set up. Add a key in Settings → AI providers.';
    const failed = { ...job, status: 'failed' as const, error: message };
    await repo.saveJob(failed);
    return NextResponse.json({ job: failed });
  }

  const [stock, assets] = await Promise.all([loadStock(repo), repo.listAssets(job.projectId)]);
  const run = async (providers: Awaited<ReturnType<typeof loadProviders>>) => advance(job, {
    providers,
    hooks: routerHooks(repo),
    stock,
    assets,
    saveVersion: (config) => repo.saveSiteVersion(job.projectId, siteConfigSchema.parse(config), 'Generated site'),
    recordStock: async (photos) => {
      await Promise.all(photos.map((p) => repo.addAsset(job.projectId, { kind: 'photo', source: p.source, url: p.url, alt: p.alt, credit: p.credit, width: p.width, height: p.height })));
    },
  });
  let result: Awaited<ReturnType<typeof run>>;
  try {
    result = await run(providers);
  } catch (err) {
    // A failure outside the AI steps (a key that can't be read, the database): say so, and free the job.
    const failed = { ...job, status: 'failed' as const, error: `This step couldn’t run: ${(err as Error).message.slice(0, 300)}` };
    await repo.saveJob(failed).catch(() => {});
    return NextResponse.json({ job: failed });
  }
  // A provider retired a model name: pick current models from its live list and try once more.
  // Up to twice, since the replacement can turn out to be retired as well.
  const retired: string[] = [];
  for (let i = 0; i < 2 && result.job.status === 'failed'; i++) {
    const found = retiredModels(result.job.error ?? '').filter((m) => !retired.includes(m));
    if (!found.length) break;
    retired.push(...found);
    if (!(await healModels(repo, retired))) break;
    result = await run(await loadProviders(repo, { projectId: job.projectId }));
  }
  await repo.saveJob(result.job);
  if (result.job.status === 'failed') alertGenerationFailed(result.job, async () => (await repo.getProject(job.projectId))?.name ?? 'a site');
  if (result.job.status === 'done' && result.job.extracted?.tagline) {
    await repo.updateProject(job.projectId, { headline: result.job.extracted.tagline.slice(0, 120) }).catch(() => {});
  }
  return NextResponse.json({ job: result.job, version: result.version ?? null });
}
