import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { sonoAiEnabled } from '@/sono-ai';
import { keepRate } from '@/sono-ai/assist/context';
import { scorecardsOf } from '@/sono-ai/assist/session';
import { assistStore } from '@/sono-ai/assist/store';
import { recalcScorecardsAction } from '../assist-actions';
import { SonoAiNav } from '../nav';
import { ActionButton } from '../notify-controls';

export const metadata: Metadata = { title: 'Scorecards · Sono AI' };

const TASK: Record<string, string> = { plan: 'Planning', fill: 'Copy', parse: 'Reading the brief', chat: 'Chat edits', custom: 'Custom sections', assistant: 'Sono AI' };
const PROVIDER: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', demo: 'Demo' };

export default async function ScorecardsPage() {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const rows = await scorecardsOf(await assistStore());
  const th = 'px-3 py-2 text-left text-[12px] font-medium text-muted';
  const td = 'px-3 py-2 tabular-nums';
  return (
    <Page title="Sono AI" newSite={false}>
      <SonoAiNav current="/sono-ai/scorecards" />
      <p className="m-0 max-w-[680px] text-[15px] text-muted">
        For each kind of task, how often each model’s answers were kept. “Kept” counts results you kept as they were; edits you made afterwards are counted
        separately. Recalculated daily from the knowledge bank.
      </p>
      <ActionButton label="Recalculate now" action={recalcScorecardsAction} />
      {rows.length ? (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-border">
                {['Task', 'Model', 'Requests', 'Failed', 'Kept', 'Edited after', 'Undone', 'Regenerated', 'Keep rate'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = keepRate(r);
                return (
                  <tr key={`${r.task}${r.provider}${r.model}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{TASK[r.task] ?? r.task}</td>
                    <td className="px-3 py-2">
                      {PROVIDER[r.provider] ?? r.provider} <span className="text-muted">{r.model}</span>
                    </td>
                    <td className={td}>{r.requests}</td>
                    <td className={td}>{r.failures ? `${r.failures} (${Math.round((r.failures / r.requests) * 100)}%)` : 0}</td>
                    <td className={td}>{r.kept}</td>
                    <td className={td}>{r.edited}</td>
                    <td className={td}>{r.undone}</td>
                    <td className={td}>{r.regenerated}</td>
                    <td className={`${td} font-semibold`}>{k === null ? '–' : `${Math.round(k * 100)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-muted">Nothing recorded yet. Results appear as you generate and edit sites.</p>
      )}
    </Page>
  );
}
