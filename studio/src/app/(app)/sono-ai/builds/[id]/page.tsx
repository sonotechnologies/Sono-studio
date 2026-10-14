import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { PRESETS } from '@/lib/presets';
import { sonoAiEnabled } from '@/sono-ai';
import { briefSummary, presetFor } from '@/sono-ai/assist/build';
import { assistStore } from '@/sono-ai/assist/store';
import { SonoAiNav } from '../../nav';
import { PlanButtons } from '../plan-button';

export const metadata: Metadata = { title: 'Build · Sono AI' };

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const { id } = await params;
  const assist = await assistStore();
  const build = (await assist.builds()).find((b) => b.id === id);
  if (!build) notFound();
  const repo = await getRepo();
  const [projects, rules] = await Promise.all([repo.listProjects(), assist.rules()]);
  const choice = presetFor(build.brief.businessType, projects, rules.filter((r) => r.enabled && r.confirmed).map((r) => r.text));
  const project = build.projectId ? projects.find((p) => p.id === build.projectId) : null;
  return (
    <Page title="Sono AI" width={900} newSite={false}>
      <SonoAiNav current="/sono-ai/builds" />
      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted">You asked{build.channel === 'telegram' ? ' on Telegram' : ''}: “{build.request}”</span>
          <h2 className="m-0 text-[22px] font-semibold">{build.brief.businessName}</h2>
        </div>
        <p className="m-0 text-[15px] leading-[1.55] whitespace-pre-wrap">{briefSummary(build.brief)}</p>
        <p className="m-0 text-[14px] text-muted">
          Style: <span className="text-text">{PRESETS[choice.preset].name}</span>, because {choice.reason}.
        </p>
        {build.status === 'discarded' ? (
          <p className="m-0 text-[14px] text-muted">Discarded.</p>
        ) : (
          <>
            <p className="m-0 text-[14px] text-muted">
              {build.status === 'started'
                ? 'The project exists. Its plan, or the finished site, is in the studio.'
                : 'Plan it creates a normal project and plans the pages. You review the plan, change it if you like, and approve it before anything is built. You can also go back and edit the brief there. Nothing is sent to the client.'}
            </p>
            <PlanButtons id={build.id} started={build.status === 'started'} />
          </>
        )}
        {project && (
          <Link href={`/projects/${project.id}`} className="text-[14px] font-medium text-accent-text hover:underline">
            Open the project
          </Link>
        )}
      </section>
    </Page>
  );
}
