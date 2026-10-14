import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { assistStore } from '@/sono-ai/assist/store';
import { SonoAiNav } from '../nav';
import { AddRule, RuleRow } from './rule-controls';

export const metadata: Metadata = { title: 'Rulebook · Sono AI' };

export default async function RulesPage() {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const rules = (await (await assistStore()).rules()).filter((r) => r.confirmed);
  return (
    <Page title="Sono AI" width={900} newSite={false}>
      <SonoAiNav current="/sono-ai/rules" />
      <p className="m-0 max-w-[680px] text-[15px] text-muted">
        Rules apply to every draft and answer. Tell Sono AI a rule in chat or on Telegram (“always quote in dollars for UK clients”); it repeats it back and saves it
        when you confirm. Switch one off to pause it.
      </p>
      <AddRule />
      {rules.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-card border border-border bg-surface p-0">
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">No rules yet.</p>
      )}
    </Page>
  );
}
