import { escapeHtml, type Button } from './telegram';

/*
 * The morning summary. Every fact comes straight from the database (the
 * sono_ai_daily function); this file only picks what deserves your attention
 * and words it, so it can't report a pitch open that didn't happen.
 *
 * Rules: only items that need a decision or action, or a real change since
 * the last summary; most important first (approvals, then follow-ups, then
 * failures, then the rest); at most five, one line each with a link; nothing
 * at all on a quiet day; kinds you turned down are left out.
 */

export interface DailyFacts {
  chatId: number | null;
  followUpDays: number;
  muted: string[];
  since: string;
  now: string;
  projects: { id: string; name: string; status: string; createdAt: string; updatedAt: string; pitchSentAt: string | null; lastOpenedAt: string | null; liveAt: string | null }[];
  opens: { projectId: string; openedAt: string }[];
  failedJobs: { projectId: string; at: string; error: string | null }[];
  deployments: { projectId: string; status: 'ready' | 'error'; at: string; url: string | null }[];
  versions: { projectId: string; count: number }[];
  usage: { provider: string; used: number; limit: number }[];
}

export const SUMMARY_KINDS = {
  approved: 'Client approvals',
  follow_up: 'Pitches needing a follow-up',
  build_failed: 'Failed generations',
  deploy_failed: 'Failed deploys',
  quota: 'AI quota running out',
  pitch_opened: 'Pitch opens',
  deployed: 'Sites deployed',
  stuck_draft: 'Projects stuck in Draft',
  site_changed: 'Sites changed',
} as const;
export type SummaryKind = keyof typeof SUMMARY_KINDS;

export interface SummaryItem {
  kind: SummaryKind;
  /** Lower comes first. */
  rank: number;
  text: string;
  projectId: string | null;
}

export const MAX_ITEMS = 5;
const DAY = 86_400_000;
const STUCK_AFTER_DAYS = 7;
const QUOTA_WARN = 0.8;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const days = (from: string, to: string) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY);
const PROVIDER: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };

export function summaryItems(f: DailyFacts): { items: SummaryItem[]; more: number } {
  const name = new Map(f.projects.map((p) => [p.id, p.name]));
  const since = new Date(f.since).getTime();
  const now = new Date(f.now).getTime();
  const all: SummaryItem[] = [];
  const add = (kind: SummaryKind, rank: number, text: string, projectId: string | null = null) => all.push({ kind, rank, text, projectId });

  for (const p of f.projects) {
    if (p.status === 'client_approved' && new Date(p.updatedAt).getTime() > since) add('approved', 0, `${p.name} approved the site. Next: deploy it.`, p.id);
    if (p.status === 'pitch_sent') {
      const last = p.lastOpenedAt ?? p.pitchSentAt;
      if (!last || now - new Date(last).getTime() >= f.followUpDays * DAY) {
        const sent = p.pitchSentAt ? `sent ${plural(days(p.pitchSentAt, f.now), 'day')} ago` : 'sent';
        add('follow_up', 1, `${p.name}: pitch ${sent}, ${p.lastOpenedAt ? `last opened ${plural(days(p.lastOpenedAt, f.now), 'day')} ago` : 'never opened'}, no reply. Time to follow up.`, p.id);
      }
    }
    if (p.status === 'draft' && now - new Date(p.createdAt).getTime() >= STUCK_AFTER_DAYS * DAY && now - new Date(p.updatedAt).getTime() >= STUCK_AFTER_DAYS * DAY)
      add('stuck_draft', 4, `${p.name} has been in Draft for ${plural(days(p.createdAt, f.now), 'day')}. Pitch it or archive it?`, p.id);
  }

  for (const id of new Set(f.failedJobs.map((j) => j.projectId))) add('build_failed', 2, `Generating ${name.get(id) ?? 'a site'} failed.`, id);
  for (const id of new Set(f.deployments.filter((d) => d.status === 'error').map((d) => d.projectId))) add('deploy_failed', 2, `Deploying ${name.get(id) ?? 'a site'} failed.`, id);
  for (const u of f.usage)
    if (u.limit > 0 && u.used / u.limit >= QUOTA_WARN) add('quota', 2, `${PROVIDER[u.provider] ?? u.provider} has used ${u.used} of today’s ${u.limit} requests.`);

  const opens = new Map<string, number>();
  for (const o of f.opens) opens.set(o.projectId, (opens.get(o.projectId) ?? 0) + 1);
  for (const [id, n] of [...opens].sort((a, b) => b[1] - a[1])) add('pitch_opened', 3, `${name.get(id) ?? 'A pitch'}: pitch opened ${n === 1 ? 'once' : `${n} times`}.`, id);
  for (const id of new Set(f.deployments.filter((d) => d.status === 'ready').map((d) => d.projectId))) add('deployed', 3, `${name.get(id) ?? 'A site'} was deployed.`, id);
  const deployed = new Set(f.deployments.map((d) => d.projectId));
  for (const v of f.versions) if (!deployed.has(v.projectId) && name.has(v.projectId)) add('site_changed', 5, `${name.get(v.projectId)}: ${plural(v.count, 'change')} saved.`, v.projectId);

  const kept = all.filter((i) => !f.muted.includes(i.kind)).sort((a, b) => a.rank - b.rank);
  return { items: kept.slice(0, MAX_ITEMS), more: Math.max(0, kept.length - MAX_ITEMS) };
}

/** The Telegram message, or null on a quiet day. One thumbs-down button per item. */
export function summaryMessage(f: DailyFacts, studioUrl: string): { html: string; buttons: Button[][] } | null {
  const { items, more } = summaryItems(f);
  if (!items.length) return null;
  const lines = items.map((i, n) => `${n + 1}. ${escapeHtml(i.text)} <a href="${studioUrl}${i.projectId ? `/projects/${i.projectId}` : '/settings'}">Open</a>`);
  if (more) lines.push(`<i>${plural(more, 'more item')} on the <a href="${studioUrl}/sono-ai">Sono AI page</a>.</i>`);
  return {
    html: `<b>Good morning.</b> Today:\n\n${lines.join('\n')}`,
    buttons: [items.map((i, n) => ({ text: `👎 ${n + 1}`, data: `mute:${i.kind}` }))],
  };
}
