import { describe, expect, it } from 'vitest';
import { compactWhen, needsFollowUp, pitchSlug, seenLine, slugify, timeAgo } from '../format';
import { statusTimestamps } from '../data/repo';
import { devSeed } from '../data/dev-seed';
import type { Project } from '../types';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function project(over: Partial<Project> = {}): Project {
  return { ...devSeed(NOW)[0], status: 'draft', pitchSentAt: null, lastOpenedAt: null, liveAt: null, ...over };
}

describe('timeAgo', () => {
  it('reads naturally across ranges', () => {
    expect(timeAgo(ago(20_000), NOW)).toBe('just now');
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(timeAgo(ago(2 * HOUR), NOW)).toBe('2 hours ago');
    expect(timeAgo(ago(1.5 * DAY), NOW)).toBe('yesterday');
    expect(timeAgo(ago(6 * DAY), NOW)).toBe('6 days ago');
    expect(timeAgo(ago(20 * DAY), NOW)).toBe('on 20 Sep');
  });
});

describe('compactWhen', () => {
  it('uses the activity list style', () => {
    expect(compactWhen(ago(2 * HOUR), NOW)).toBe('2h ago');
    expect(compactWhen(ago(30 * HOUR), NOW)).toBe('Yesterday');
    expect(compactWhen(ago(2 * DAY), NOW)).toBe('8 Oct');
  });
});

describe('seenLine', () => {
  it('matches the dashboard card copy', () => {
    expect(seenLine(project(), NOW)).toBe('Not sent yet');
    expect(seenLine(project({ status: 'pitch_sent', pitchSentAt: ago(DAY) }), NOW)).toBe('Not opened yet');
    expect(seenLine(project({ status: 'pitch_sent', lastOpenedAt: ago(2 * HOUR) }), NOW)).toBe('Opened 2 hours ago');
    expect(seenLine(project({ status: 'live', liveAt: ago(7 * DAY) }), NOW)).toBe('Live since 3 Oct');
  });
});

describe('needsFollowUp', () => {
  it('flags sent pitches that have gone quiet', () => {
    expect(needsFollowUp(project({ status: 'pitch_sent', pitchSentAt: ago(5 * DAY) }), NOW)).toBe(true);
    expect(needsFollowUp(project({ status: 'pitch_sent', pitchSentAt: ago(8 * DAY), lastOpenedAt: ago(6 * DAY) }), NOW)).toBe(true);
    expect(needsFollowUp(project({ status: 'pitch_sent', pitchSentAt: ago(2 * DAY), lastOpenedAt: ago(2 * HOUR) }), NOW)).toBe(false);
    expect(needsFollowUp(project({ status: 'pitch_sent', pitchSentAt: ago(1 * DAY) }), NOW)).toBe(false);
    expect(needsFollowUp(project({ status: 'client_approved', pitchSentAt: ago(10 * DAY) }), NOW)).toBe(false);
  });

  it('matches the design sample: Crumb & Co and Wanderly need a nudge', () => {
    const flagged = devSeed(NOW).filter((p) => needsFollowUp(p, NOW)).map((p) => p.name);
    expect(flagged).toEqual(['Crumb & Co', 'Wanderly Travel']);
  });
});

describe('slugs', () => {
  it('slugifies business names', () => {
    expect(slugify('Crumb & Co')).toBe('crumb-and-co');
    expect(slugify('Maison Lune — Quai des Pêcheurs')).toBe('maison-lune-quai-des-pecheurs');
    expect(slugify('!!!')).toBe('site');
  });

  it('adds a ten-character random suffix', () => {
    let i = 0;
    const seq = [0, 0.5, 0.25, 0.99];
    expect(pitchSlug('Kora Kitchen', () => seq[i++ % 4])).toMatch(/^kora-kitchen-[a-z2-9]{10}$/);
    expect(pitchSlug('Kora Kitchen')).not.toBe(pitchSlug('Kora Kitchen'));
  });
});

describe('statusTimestamps', () => {
  const now = '2026-10-10T12:00:00.000Z';
  it('stamps the first send and the first go-live only', () => {
    expect(statusTimestamps({ pitchSentAt: null, liveAt: null }, 'pitch_sent', now)).toEqual({ pitchSentAt: now });
    expect(statusTimestamps({ pitchSentAt: 'x', liveAt: null }, 'pitch_sent', now)).toEqual({});
    expect(statusTimestamps({ pitchSentAt: 'x', liveAt: null }, 'live', now)).toEqual({ liveAt: now });
    expect(statusTimestamps({ pitchSentAt: null, liveAt: null }, 'draft', now)).toEqual({});
  });
});
