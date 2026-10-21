import type { Bookings, Service } from '../schema';
import { fromMinor, minorUnits } from './payments-info';

/*
 * Which start times are free, worked out in the business's own time zone, so
 * a visitor in another country sees the same times the business does. Used by
 * the booking widget (to show times) and on the server (to check a booking
 * before taking a deposit).
 */

export interface Busy {
  /** ISO times. */
  start: string;
  end: string;
}

export interface Slot {
  /** ISO time (UTC) the booking starts. */
  start: string;
  end: string;
  /** "09:30", in the business's time zone. */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes the zone is ahead of UTC at that moment. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime()) / 60_000;
}

/** "2026-10-14" at "09:30" in the zone, as a moment in time. */
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMinutes(new Date(guess), timeZone);
  let t = guess - first * 60_000;
  // Around a clock change the offset can differ at the answer; check once more.
  const second = offsetMinutes(new Date(t), timeZone);
  if (second !== first) t = guess - second * 60_000;
  return new Date(t);
}

/** The date ("2026-10-14") and time ("09:30") of a moment, in the zone. */
export function zonedParts(at: Date, timeZone: string): { date: string; time: string } {
  const shifted = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60_000);
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Days with opening hours, from today (in the zone) up to `daysAhead`. */
export function openDays(b: Bookings, now: Date = new Date()): string[] {
  const today = zonedParts(now, b.timezone).date;
  const out: string[] = [];
  for (let i = 0; i < b.daysAhead; i++) {
    const date = addDays(today, i);
    if (b.closed.includes(date)) continue;
    if (b.hours.some((h) => h.day === weekday(date))) out.push(date);
  }
  return out;
}

/**
 * Free start times for a service on a date: every `step` minutes within each
 * opening span, finishing by closing time, with enough notice, and with fewer
 * overlapping bookings than the capacity.
 */
export function slotsFor(b: Bookings, service: Pick<Service, 'duration'>, date: string, busy: Busy[], now: Date = new Date()): Slot[] {
  if (b.closed.includes(date)) return [];
  const earliest = now.getTime() + b.notice * 3_600_000;
  const taken = busy.map((x) => [Date.parse(x.start), Date.parse(x.end)] as const);
  const out: Slot[] = [];
  for (const span of b.hours.filter((h) => h.day === weekday(date)).sort((x, y) => x.open.localeCompare(y.open))) {
    for (let m = minutes(span.open); m + service.duration <= minutes(span.close); m += b.step) {
      const start = zonedTime(date, hhmm(m), b.timezone);
      // Around a clock change some times don't exist, or would repeat: skip any that don't read back the same.
      const back = zonedParts(start, b.timezone);
      if (back.date !== date || back.time !== hhmm(m) || out.some((x) => x.start === start.toISOString())) continue;
      if (start.getTime() < earliest) continue;
      const end = new Date(start.getTime() + service.duration * 60_000);
      const overlapping = taken.filter(([s, e]) => s < end.getTime() && e > start.getTime()).length;
      if (overlapping >= b.capacity) continue;
      out.push({ start: start.toISOString(), end: end.toISOString(), label: hhmm(m) });
    }
  }
  return out;
}

/** Whether a start time is one of the free slots (checked on the server before a deposit is taken). */
export function slotFree(b: Bookings, service: Pick<Service, 'duration'>, startIso: string, busy: Busy[], now: Date = new Date()): Slot | null {
  const at = new Date(startIso);
  if (Number.isNaN(at.getTime())) return null;
  const { date } = zonedParts(at, b.timezone);
  // Only as far ahead as the business takes bookings.
  if (!openDays(b, now).includes(date)) return null;
  return slotsFor(b, service, date, busy, now).find((s) => s.start === at.toISOString()) ?? null;
}

/** The deposit for a service, in the bookings currency (0 when there's none to take). */
export function depositFor(b: Pick<Bookings, 'depositPercent' | 'currency'>, service: Pick<Service, 'price'>): number {
  if (!b.depositPercent || service.price <= 0) return 0;
  const raw = (service.price * b.depositPercent) / 100;
  // Rounded to the currency's smallest unit, as the payment providers charge it.
  return fromMinor(minorUnits(raw, b.currency), b.currency);
}

/** "Tue 14 Oct" in the business's zone. */
export function dayLabel(date: string, locale = 'en-GB'): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Tue 14 Oct, 09:30" for a booking's start, in the business's zone. */
export function whenLabel(startIso: string, timeZone: string): string {
  const { date, time } = zonedParts(new Date(startIso), timeZone);
  return `${dayLabel(date)}, ${time}`;
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}
