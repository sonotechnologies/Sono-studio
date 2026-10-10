import { NextResponse } from 'next/server';
import { getRepo, getUser } from '@/lib/auth';
import { slugify } from '@/lib/format';

/**
 * Everything needed to review how a site was generated, as one JSON file:
 * the current config, the brief and plan, and which model ran each step.
 * Contains no keys or other secrets.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await params;
  const repo = await getRepo();
  const project = await repo.getProject(id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [version, job] = await Promise.all([repo.getSiteVersion(id), repo.getLatestJob(id)]);
  const body = {
    exportedAt: new Date().toISOString(),
    project: { name: project.name, businessType: project.businessType, preset: project.preset },
    version: version ? { number: version.version, summary: version.summary, createdAt: version.createdAt } : null,
    generation: job
      ? { status: job.status, brief: job.brief, extracted: job.extracted, plan: job.plan, steps: job.steps, error: job.error }
      : null,
    config: version?.config ?? null,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${slugify(project.name)}-site-data.json"`,
    },
  });
}
