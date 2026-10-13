import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { sonoAiEnabled, indexSoon } from '@/sono-ai';
import { keyedStoreSignedIn, settingsStore } from '@/sono-ai/notify-store';
import { getStore } from '@/sono-ai/store';
import { SUMMARY_KINDS, summaryItems, type SummaryKind } from '@/sono-ai/summary';
import { telegramToken } from '@/sono-ai/telegram';
import { ImportButton } from './import-button';
import { ActionButton, ConnectTelegram, FollowUpDays } from './notify-controls';
import { disconnectTelegramAction, rebuildIndexAction, sendSummaryNowAction, testTelegramAction, unmuteAction } from './notify-actions';

export const metadata: Metadata = { title: 'Sono AI' };

const label = 'text-[13px] font-medium tracking-[0.12em] text-muted uppercase';
const preview = (s: string | null) => (s && s.length > 2000 ? `${s.slice(0, 2000)}…` : (s ?? ''));

/** Stage 1: what the knowledge bank has recorded, redacted, and a way to import past history. */
export default async function SonoAiPage() {
  await requireUser();
  if (!sonoAiEnabled()) notFound();
  const store = await getStore();
  const repo = await getRepo();
  const settingsDb = await settingsStore();
  // Lets the morning summary, Telegram and pitch alerts recognise this studio's server.
  await settingsDb.registerKey();
  const [stats, recent, projects, settings, facts, chunks] = await Promise.all([
    store.stats(),
    store.listInteractions({ limit: 25, withText: true }),
    repo.listProjects(),
    settingsDb.get(),
    (await keyedStoreSignedIn()).daily(false).catch(() => null),
    store.listChunks().catch(() => []),
  ]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const summary = facts ? summaryItems(facts) : null;
  const hasToken = !!telegramToken();
  indexSoon(repo);

  return (
    <Page title="Sono AI" newSite={false}>
      <p className="m-0 max-w-[680px] text-[16px] leading-normal text-muted">
        Experimental. Sono AI records every AI request and answer with client details swapped for placeholders, and links each result to what came of it. It
        changes nothing about how sites are built.
      </p>

      <section className="flex flex-wrap gap-3">
        {[
          ['Requests recorded', stats.interactions],
          ['Since switching on', stats.live],
          ['Imported history', stats.backfilled],
          ['Outcomes linked', stats.outcomes],
          ['Placeholders', stats.redactions],
        ].map(([k, v]) => (
          <div key={k} className="flex min-w-[150px] flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3">
            <span className="text-[13px] text-muted">{k}</span>
            <span className="text-[24px] font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={`m-0 ${label}`}>Telegram</h2>
        {settings.telegramChatId ? (
          <>
            <p className="m-0 max-w-[680px] text-[14px] text-muted">
              Connected. Alerts arrive as things happen: a pitch link&rsquo;s first open, a failed generation or deploy, a provider hitting its limit, and every
              provider resting at once. The bot answers only your chat.
            </p>
            <div className="flex flex-wrap gap-3">
              <ActionButton label="Send a test message" busyLabel="Sending…" action={testTelegramAction} />
              <ActionButton label="Disconnect" action={disconnectTelegramAction} />
            </div>
          </>
        ) : hasToken ? (
          <>
            <p className="m-0 max-w-[680px] text-[14px] text-muted">Connect your Telegram chat to get alerts and the morning summary.</p>
            <ConnectTelegram />
          </>
        ) : (
          <ol className="m-0 flex max-w-[680px] flex-col gap-1.5 pl-5 text-[14px] text-muted">
            <li>
              In Telegram, open <b className="text-text">@BotFather</b>, send <code>/newbot</code>, and pick a name and username. It replies with a token.
            </li>
            <li>
              In Vercel, add it as <code>TELEGRAM_BOT_TOKEN</code> (Settings → Environment Variables), then redeploy. Never paste it anywhere else.
            </li>
            <li>Come back here and press Connect Telegram.</li>
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={`m-0 ${label}`}>Morning summary</h2>
        <p className="m-0 max-w-[680px] text-[14px] text-muted">
          Around 8:00 Lagos time, only when something needs you: at most five items, most important first, each with a link. Nothing is sent on a quiet day.
          A thumbs-down on an item leaves that kind out from then on.
        </p>
        <FollowUpDays value={settings.followUpDays} />
        {settings.muted.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[14px]">Left out of summaries:</span>
            {settings.muted.map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-3 text-[14px]">
                <span className="min-w-[200px]">{SUMMARY_KINDS[k as SummaryKind] ?? k}</span>
                <ActionButton label="Bring back" action={unmuteAction.bind(null, k)} />
              </div>
            ))}
          </div>
        )}
        <div className="flex max-w-[680px] flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3">
          <span className="text-[13px] text-muted">If it were sent now</span>
          {summary?.items.length ? (
            <ol className="m-0 flex flex-col gap-1 pl-5 text-[14px]">
              {summary.items.map((i, n) => (
                <li key={n}>{i.text}</li>
              ))}
              {summary.more > 0 && <li className="list-none text-muted">and {summary.more} more</li>}
            </ol>
          ) : (
            <span className="text-[14px] text-muted">Nothing worth your attention, so no message.</span>
          )}
        </div>
        {settings.telegramChatId ? <ActionButton label="Send it to Telegram now" busyLabel="Sending…" action={sendSummaryNowAction} /> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={`m-0 ${label}`}>Knowledge search index</h2>
        <p className="m-0 max-w-[680px] text-[14px] text-muted">
          Project summaries, client notes and pitch outcomes, redacted and indexed by meaning for the assistant in the next stage. It catches up in the
          background while you work. Embeddings use your Gemini key ({chunks.length ? `${chunks.filter((c) => c.embedded).length} of ${chunks.length} chunks embedded` : 'nothing indexed yet'}
          {settings.lastIndexedAt ? `, last updated ${new Date(settings.lastIndexedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}).
        </p>
        <ActionButton label="Update the index now" busyLabel="Indexing…" action={rebuildIndexAction} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={`m-0 ${label}`}>Past history</h2>
        <p className="m-0 max-w-[680px] text-[14px] text-muted">
          Imports earlier generations, chat edits, site versions and pitch opens. Run it once; running it again only adds what&rsquo;s new.
        </p>
        <ImportButton />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={`m-0 ${label}`}>Latest requests</h2>
        {recent.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {recent.map((i) => (
              <li key={i.id}>
                <details className="rounded-card border border-border bg-surface px-4 py-3">
                  <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
                    <span className="font-semibold">{i.task}</span>
                    <span className="text-muted">{i.projectId ? (names.get(i.projectId) ?? 'Deleted project') : 'No project'}</span>
                    <span className="text-muted">{[i.provider, i.model].filter(Boolean).join(' · ') || 'from history'}</span>
                    {i.ms !== null && <span className="text-muted tabular-nums">{(i.ms / 1000).toFixed(1)}s</span>}
                    {i.inputTokens !== null && <span className="text-muted tabular-nums">{i.inputTokens + (i.outputTokens ?? 0)} tokens</span>}
                    <span className={i.status === 'ok' ? 'text-muted' : 'text-danger'}>{i.status === 'ok' ? '' : i.status}</span>
                    <span className="ml-auto text-muted tabular-nums">{new Date(i.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </summary>
                  <div className="mt-3 grid gap-3 @container md:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12px] text-muted">Request (as stored)</span>
                      <pre className="m-0 max-h-[320px] overflow-auto rounded-lg bg-hover p-3 text-[12px] whitespace-pre-wrap">{preview(i.request)}</pre>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12px] text-muted">{i.error ? 'Error' : 'Answer (as stored)'}</span>
                      <pre className="m-0 max-h-[320px] overflow-auto rounded-lg bg-hover p-3 text-[12px] whitespace-pre-wrap">{preview(i.error ?? i.answer)}</pre>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-muted">Nothing yet. Generate a site or use chat in the workspace, or import past history.</p>
        )}
      </section>
    </Page>
  );
}
