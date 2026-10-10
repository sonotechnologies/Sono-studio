import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { pitchUrl } from '@/lib/format';
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
  return (
    <Page title={project.name} width={1200}>
      <ProjectDetails project={project} link={pitchUrl(project.pitchSlug)} now={Date.now()} />
    </Page>
  );
}
