import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { SonoAiNav } from '../nav';

export const metadata: Metadata = { title: 'Builds · Sono AI' };

const JOB: Record<string, string> = { draft: 'Brief', running: 'Planning or building', plan_review: 'Plan waiting for you', done: 'Built', failed: 'Failed' };

export default async function BuildsPage() {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const assist = await assistStore();
  const repo = await getRepo();
  const [builds, drafts] = await Promise.all([assist.builds(), assist.drafts()]);
  const jobs = new Map(await Promise.all(builds.filter((b) => b.projectId).map(async (b) => [b.id, (await repo.getLatestJob(b.projectId!))?.status ?? null] as const)));
  // How reliable Sono AI's drafts have been: the brief's signal for trusting it with builds.
  const decided = drafts.filter((d) => d.status === 'approved' && d.kind !== 'checklist');
  const untouched = decided.filter((d) => !d.finalBody).length;
  return (
    <Page title="Sono AI" width={900} newSite={false}>
      <SonoAiNav current="/sono-ai/builds" />
      <p className="m-0 max-w-[680px] text-[15px] text-muted">
        Ask Sono AI to build a site, in chat or on Telegram: “build a pitch site for Mama’s Kitchen, a restaurant in Lekki, WhatsApp 0803…”. It fills in the brief
        and picks a style from what worked for you; you plan it, approve the plan, and it builds through the studio like any site. Pitches are never sent for you.
      </p>
      <p className="m-0 text-[14px] text-muted">
        Drafts approved without edits so far: <span className="text-text">{decided.length ? `${untouched} of ${decided.length}` : 'none yet'}</span>
      </p>
      {builds.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-card border border-border bg-surface p-0">
          {builds.map((b) => (
            <li key={b.id}>
              <Link href={`/sono-ai/builds/${b.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-hover">
                <span className="text-[15px] font-semibold">{b.brief.businessName}</span>
                <span className="text-[13px] text-muted">{b.brief.businessType}</span>
                <span className="ml-auto text-[13px] text-muted">
                  {b.status === 'requested' ? 'Waiting for you to plan it' : b.status === 'discarded' ? 'Discarded' : (JOB[jobs.get(b.id) ?? ''] ?? 'Started')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">No builds yet.</p>
      )}
    </Page>
  );
}
