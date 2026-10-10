import type { Project } from './types';

/** Days after the last pitch activity before a sent pitch needs a nudge. */
export const FOLLOW_UP_AFTER_DAYS = 3;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 Oct", matching the design's short date style. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "just now", "2 hours ago", "yesterday", "6 days ago", or a short date after two weeks. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < HOUR) {
    const m = Math.floor(diff / 60_000);
    return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : `${m} minutes ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  const d = Math.floor(diff / DAY);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return `on ${shortDate(iso)}`;
}

/** Compact form for activity rows: "2h ago", "Yesterday", "8 Oct". */
export function compactWhen(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return 'Yesterday';
  return shortDate(iso);
}

/** A pitch was sent and nothing has happened on it for a few days. */
export function needsFollowUp(p: Project, now: number = Date.now()): boolean {
  if (p.status !== 'pitch_sent') return false;
  const last = p.lastOpenedAt ?? p.pitchSentAt;
  if (!last) return true;
  return now - new Date(last).getTime() >= FOLLOW_UP_AFTER_DAYS * DAY;
}

/** The small line under a project card: "Opened 2 hours ago", "Not opened yet", ... */
export function seenLine(p: Project, now: number = Date.now()): string {
  if (p.status === 'live') return p.liveAt ? `Live since ${shortDate(p.liveAt)}` : 'Live';
  if (p.lastOpenedAt) return `Opened ${timeAgo(p.lastOpenedAt, now)}`;
  if (p.status === 'draft') return 'Not sent yet';
  return 'Not opened yet';
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || 'site'
  );
}

/** Pitch slugs carry a short random suffix so links can't be guessed from the business name. */
export function pitchSlug(name: string, random: () => number = Math.random): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${slugify(name)}-${suffix}`;
}

/** Base URL for pitch links, kept in one variable so a domain switch is a single change. */
export function pitchUrl(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/p/${slug}`;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
