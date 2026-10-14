import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { approveHref } from '@/sono-ai/assist/drafts';
import { assistStore } from '@/sono-ai/assist/store';
import { ActionButton } from '../notify-controls';
import { draftAction } from '../assist-actions';
import { SonoAiNav } from '../nav';
import { DraftCard, ProjectDraft } from './draft-card';

export const metadata: Metadata = { title: 'Drafts · Sono AI' };

export default async function DraftsPage() {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const [drafts, projects] = await Promise.all([(await assistStore()).drafts(), (await getRepo()).listProjects()]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const pending = drafts.filter((d) => d.status === 'pending');
  const done = drafts.filter((d) => d.status !== 'pending').slice(0, 20);
  return (
    <Page title="Sono AI" width={900} newSite={false}>
      <SonoAiNav current="/sono-ai/drafts" />
      <p className="m-0 max-w-[680px] text-[15px] text-muted">
        Nothing here is sent by Sono AI. Approve opens WhatsApp with the message filled in (for Instagram it copies the message and opens the chat), and you press send.
        Your edits teach it how you write.
      </p>
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <ActionButton label="Draft follow-ups for pitches that need one" busyLabel="Writing…" action={draftAction.bind(null, 'follow_up', null)} primary />
        <ProjectDraft projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[13px] font-medium tracking-[0.12em] text-muted uppercase">Waiting for you</h2>
        {pending.length ? (
          pending.map((d) => <DraftCard key={d.id} draft={d} project={d.projectId ? (names.get(d.projectId) ?? null) : null} href={approveHref(d)} />)
        ) : (
          <p className="m-0 text-[14px] text-muted">No drafts waiting.</p>
        )}
      </section>
      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-[13px] font-medium tracking-[0.12em] text-muted uppercase">Recently handled</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
            {done.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-x-3 text-muted">
                <span className="text-text">{d.title}</span>
                <span>{d.status === 'approved' ? (d.finalBody ? 'approved after your edit' : 'approved') : 'skipped'}</span>
                <span>{d.decidedAt ? new Date(d.decidedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
