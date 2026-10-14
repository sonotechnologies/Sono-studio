import type { ClientDetails } from '../redact';
import type { Interaction, Outcome } from '../store';
import type { ScoreRow } from './types';

/*
 * What Sono AI knows about the studio when you ask about your work: plain
 * facts from the database, which kinds of business your pitches work best
 * for, and how each model's answers fared. Numbers are worked out here, in
 * code, so the model only puts them into words.
 */

export interface SnapshotProject {
  id: string;
  name: string;
  businessType: string;
  siteType: string;
  status: string;
  createdAt: string;
  pitchSentAt: string | null;
  lastOpenedAt: string | null;
  liveAt: string | null;
  /** For the pitch link in follow-ups; absent where it isn't known. */
  pitchSlug?: string;
  client: ClientDetails & { notes?: string };
}

export interface Snapshot {
  now: string;
  followUpDays: number;
  projects: SnapshotProject[];
}

const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10);
const month = (iso: string) => iso.slice(0, 7);
const STATUS: Record<string, string> = { draft: 'draft', pitch_sent: 'pitch sent', client_approved: 'approved by the client', live: 'live' };

export function needsFollowUp(p: SnapshotProject, s: Snapshot): boolean {
  if (p.status !== 'pitch_sent') return false;
  const last = p.lastOpenedAt ?? p.pitchSentAt;
  return !last || new Date(s.now).getTime() - new Date(last).getTime() >= s.followUpDays * DAY;
}

export interface LeadRow {
  businessType: string;
  projects: number;
  pitched: number;
  opened: number;
  approved: number;
  live: number;
}

/** How pitches have gone, per kind of business: what to pitch next. */
export function leadStats(projects: SnapshotProject[]): LeadRow[] {
  const by = new Map<string, LeadRow>();
  for (const p of projects) {
    const key = p.businessType.trim() || 'Other';
    const r = by.get(key) ?? { businessType: key, projects: 0, pitched: 0, opened: 0, approved: 0, live: 0 };
    r.projects++;
    if (p.pitchSentAt || p.status !== 'draft') r.pitched++;
    if (p.lastOpenedAt) r.opened++;
    if (p.status === 'client_approved' || p.status === 'live') r.approved++;
    if (p.status === 'live') r.live++;
    by.set(key, r);
  }
  return [...by.values()].sort((a, b) => b.approved / Math.max(1, b.pitched) - a.approved / Math.max(1, a.pitched) || b.pitched - a.pitched);
}

export function factsText(s: Snapshot): string {
  const ps = s.projects;
  const count = (f: (p: SnapshotProject) => boolean) => ps.filter(f).length;
  const thisMonth = month(s.now);
  const lastMonth = month(new Date(new Date(`${thisMonth}-01T00:00:00Z`).getTime() - DAY).toISOString());
  const lines = [
    `Today is ${day(s.now)}.`,
    `Projects: ${ps.length} (${['draft', 'pitch_sent', 'client_approved', 'live'].map((st) => `${count((p) => p.status === st)} ${STATUS[st]}`).join(', ')}).`,
    `Pitches sent this month (${thisMonth}): ${count((p) => !!p.pitchSentAt && month(p.pitchSentAt) === thisMonth)}; last month (${lastMonth}): ${count((p) => !!p.pitchSentAt && month(p.pitchSentAt) === lastMonth)}.`,
    `Pitches opened at least once: ${count((p) => !!p.lastOpenedAt)} of ${count((p) => !!p.pitchSentAt)} sent.`,
    `Needing a follow-up (no reply for ${s.followUpDays}+ days): ${ps.filter((p) => needsFollowUp(p, s)).map((p) => p.name).join(', ') || 'none'}.`,
    '',
    'By kind of business (projects / pitched / opened / approved / live):',
    ...leadStats(ps).map((r) => `- ${r.businessType}: ${r.projects} / ${r.pitched} / ${r.opened} / ${r.approved} / ${r.live}`),
    '',
    'Each project:',
    ...ps.slice(0, 60).map(
      (p) =>
        `- ${p.name} (${p.businessType || 'business'}, ${p.siteType} site): ${STATUS[p.status] ?? p.status}; created ${day(p.createdAt)}` +
        (p.pitchSentAt ? `; pitch sent ${day(p.pitchSentAt)}` : '') +
        (p.lastOpenedAt ? `; last opened ${day(p.lastOpenedAt)}` : p.pitchSentAt ? '; never opened' : '') +
        (p.liveAt ? `; live since ${day(p.liveAt)}` : ''),
    ),
  ];
  return lines.join('\n');
}

/** Results per task, provider and model, from the recorded requests and what came of them. */
export function computeScorecards(interactions: Interaction[], outcomes: Outcome[]): ScoreRow[] {
  const rows = new Map<string, ScoreRow>();
  const keyOf = (i: Interaction) => `${i.task}|${i.provider}|${i.model}`;
  const byId = new Map<string, Interaction>();
  for (const i of interactions) {
    if (!i.provider) continue;
    byId.set(i.id, i);
    const r = rows.get(keyOf(i)) ?? { task: i.task, provider: i.provider, model: i.model, requests: 0, failures: 0, kept: 0, edited: 0, undone: 0, regenerated: 0 };
    r.requests++;
    if (i.status !== 'ok') r.failures++;
    rows.set(keyOf(i), r);
  }
  for (const o of outcomes) {
    const i = o.interactionId ? byId.get(o.interactionId) : undefined;
    if (!i || !(o.kind === 'kept' || o.kind === 'edited' || o.kind === 'undone' || o.kind === 'regenerated')) continue;
    rows.get(keyOf(i))![o.kind]++;
  }
  return [...rows.values()].sort((a, b) => a.task.localeCompare(b.task) || b.requests - a.requests);
}

/** Share of judged answers you kept, edited or not; null before anything was judged. */
export function keepRate(r: ScoreRow): number | null {
  const judged = r.kept + r.undone + r.regenerated;
  return judged ? r.kept / judged : null;
}

export function scorecardText(rows: ScoreRow[]): string {
  if (!rows.length) return 'No model results recorded yet.';
  return [
    'Model results (task: provider model: requests, failures, kept, edited after, undone, regenerated, keep rate):',
    ...rows.map((r) => {
      const k = keepRate(r);
      return `- ${r.task}: ${r.provider} ${r.model}: ${r.requests} requests, ${r.failures} failed, ${r.kept} kept, ${r.edited} edited, ${r.undone} undone, ${r.regenerated} regenerated, keep rate ${k === null ? 'n/a' : `${Math.round(k * 100)}%`}`;
    }),
  ].join('\n');
}
