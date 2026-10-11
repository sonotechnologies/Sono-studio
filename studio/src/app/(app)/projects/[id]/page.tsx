import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchUrl } from '@/lib/format';
import { handoverChecklist } from '@/export/checklist';
import { siteConfigSchema } from '@/site/schema';
import { ProjectDetails } from './project-details';

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  return (await getRepo()).getProject(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await load((await params).id);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectPage({ params }: Props) {
  await requireUser();
  const project = await load((await params).id);
  if (!project) notFound();
  const repo = await getRepo();
  const [job, events, version, keys, latest] = await Promise.all([
    repo.getLatestJob(project.id),
    repo.listPitchEvents(project.id, 50),
    repo.getSiteVersion(project.id),
    repo.listProviderKeys(),
    repo.getLatestDeployment(project.id),
  ]);
  const parsed = version ? siteConfigSchema.safeParse(version.config) : null;
  const website = parsed?.success
    ? {
        version: version!.version,
        checklist: handoverChecklist(parsed.data),
        hasVercel: keys.some((k) => k.provider === 'vercel'),
        hasGithub: keys.some((k) => k.provider === 'github'),
        latest,
      }
    : null;
  const setup = job && job.status !== 'done' ? { jobId: job.id, status: job.status } : null;
  return (
    <Page title={project.name} width={1200}>
      <ProjectDetails project={project} link={pitchUrl(project.pitchSlug)} now={Date.now()} setup={setup} events={events} website={website} />
    </Page>
  );
}
