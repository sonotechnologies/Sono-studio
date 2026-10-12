import { describe, expect, it } from 'vitest';
import type { Bookings } from '../schema';
import { depositFor, openDays, slotFree, slotsFor, whenLabel, zonedParts, zonedTime } from './booking-slots';

const b: Bookings = {
  currency: 'NGN',
  whatsapp: '+234 803 000 0000',
  timezone: 'Africa/Lagos',
  services: [{ id: 'cut', name: 'Cut', duration: 60, price: 15000, description: '', category: '' }],
  // Monday: 09:00–12:00 and 13:00–17:00; Saturday 10:00–14:00.
  hours: [
    { day: 1, open: '09:00', close: '12:00' },
    { day: 1, open: '13:00', close: '17:00' },
    { day: 6, open: '10:00', close: '14:00' },
  ],
  step: 30,
  capacity: 1,
  notice: 2,
  daysAhead: 14,
  closed: ['2026-10-17'],
  depositPercent: 30,
  payments: { whatsapp: true, paystack: true, stripe: false },
};

// Sunday 11 Oct 2026, 08:00 in Lagos (UTC+1).
const now = new Date('2026-10-11T07:00:00Z');

describe('booking times', () => {
  it('converts the business’s local times to moments and back', () => {
    expect(zonedTime('2026-10-12', '09:00', 'Africa/Lagos').toISOString()).toBe('2026-10-12T08:00:00.000Z');
    expect(zonedTime('2026-10-12', '09:00', 'Africa/Accra').toISOString()).toBe('2026-10-12T09:00:00.000Z');
    // New York is on summer time in October and winter time in December.
    expect(zonedTime('2026-10-12', '09:00', 'America/New_York').toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(zonedTime('2026-12-14', '09:00', 'America/New_York').toISOString()).toBe('2026-12-14T14:00:00.000Z');
    expect(zonedParts(new Date('2026-10-12T08:00:00Z'), 'Africa/Lagos')).toEqual({ date: '2026-10-12', time: '09:00' });
  });

  it('lists only open days, skipping closed dates', () => {
    const days = openDays(b, now);
    expect(days.slice(0, 3)).toEqual(['2026-10-12', '2026-10-19', '2026-10-24']);
    expect(days).not.toContain('2026-10-17');
  });

  it('offers times every step that finish by closing, around the lunch break', () => {
    const labels = slotsFor(b, { duration: 60 }, '2026-10-12', [], now).map((s) => s.label);
    expect(labels).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00']);
  });

  it('keeps the notice period and skips booked times, up to the capacity', () => {
    const monday9 = new Date('2026-10-12T08:00:00Z');
    expect(slotsFor(b, { duration: 60 }, '2026-10-12', [], new Date(monday9.getTime() - 3_600_000))[0].label).toBe('10:00');
    const busy = [{ start: '2026-10-12T09:00:00Z', end: '2026-10-12T10:00:00Z' }]; // 10:00–11:00 local
    const labels = slotsFor(b, { duration: 60 }, '2026-10-12', busy, now).map((s) => s.label);
    expect(labels).not.toContain('10:00');
    expect(labels).not.toContain('09:30');
    expect(labels).not.toContain('10:30');
    expect(labels).toContain('09:00');
    expect(slotsFor({ ...b, capacity: 2 }, { duration: 60 }, '2026-10-12', busy, now).map((s) => s.label)).toContain('10:00');
  });

  it('checks a requested start time on the server', () => {
    expect(slotFree(b, { duration: 60 }, '2026-10-12T08:00:00.000Z', [], now)?.label).toBe('09:00');
    expect(slotFree(b, { duration: 60 }, '2026-10-12T08:10:00.000Z', [], now)).toBeNull();
    expect(slotFree(b, { duration: 60 }, '2026-10-17T09:00:00.000Z', [], now)).toBeNull();
    expect(slotFree(b, { duration: 60 }, 'nonsense', [], now)).toBeNull();
  });

  it('works out deposits and labels', () => {
    expect(depositFor(b, { price: 15000 })).toBe(4500);
    expect(depositFor({ ...b, depositPercent: 0 }, { price: 15000 })).toBe(0);
    expect(depositFor(b, { price: 0 })).toBe(0);
    expect(whenLabel('2026-10-12T08:00:00Z', 'Africa/Lagos')).toBe('Mon 12 Oct, 09:00');
  });
});
