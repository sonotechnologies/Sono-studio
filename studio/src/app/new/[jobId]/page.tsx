import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRepo, requireUser } from '@/lib/auth';
import { aiMode } from '../ai-mode';
import { SetupFlow } from '../setup-flow';

export const metadata: Metadata = { title: 'New site' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SetupPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ step?: string }> }) {
  await requireUser();
  const { jobId } = await params;
  const { step } = await searchParams;
  if (!UUID.test(jobId)) notFound();
  const repo = await getRepo();
  const job = await repo.getJob(jobId);
  if (!job) notFound();
  const n = Number(step);
  return (
    <SetupFlow
      key={job.id}
      initialJob={job}
      initialAssets={await repo.listAssets(job.projectId)}
      initialStep={Number.isInteger(n) && n >= 0 && n <= 3 ? n : 1}
      aiMode={await aiMode(repo)}
      styles={await repo.listStyles()}
    />
  );
}
