'use client';

import { ChevronRight } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui';
import type { BookingRecord, BookingStatus } from '@/lib/data/repo';
import { whenLabel } from '@/site/store/booking-slots';
import { formatPrice } from '@/site/store/format';
import { setBookingStatusAction } from '../actions';

const STATUS: Record<BookingStatus, { label: string; tone: string }> = {
  held: { label: 'Awaiting deposit', tone: 'bg-sel text-muted' },
  confirmed: { label: 'Confirmed', tone: 'bg-success-bg text-success' },
  done: { label: 'Done', tone: 'bg-sel text-text' },
  no_show: { label: 'No-show', tone: 'bg-sel text-danger' },
  cancelled: { label: 'Cancelled', tone: 'bg-sel text-muted' },
};

/** Upcoming and recent bookings: test ones from the pitch link and preview, live ones from the deployed site. */
export function BookingsCard({
  projectId,
  bookings: initial,
  timezone,
  now,
  onSetStatus,
}: {
  projectId: string;
  bookings: BookingRecord[];
  timezone: string;
  now: number;
  onSetStatus?: (id: string, status: BookingStatus) => Promise<unknown>;
}) {
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();
  // A hold that ran out without a deposit is noise.
  const shown = list.filter((b) => b.status !== 'held' || (b.holdUntil && Date.parse(b.holdUntil) > now));
  const upcoming = shown.filter((b) => b.status === 'confirmed' && Date.parse(b.start) > now).length;

  const set = (b: BookingRecord, status: BookingStatus) => {
    setList((l) => l.map((x) => (x.id === b.id ? { ...x, status } : x)));
    start(async () => {
      try {
        await (onSetStatus ? onSetStatus(b.id, status) : setBookingStatusAction(projectId, b.id, status));
      } catch {
        setList((l) => l.map((x) => (x.id === b.id ? b : x)));
        toast('Couldn’t update the booking');
      }
    });
  };

  return (
    <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-[18px]">
      <div className="flex items-baseline gap-2 pb-2">
        <h2 className="m-0 flex-1 text-[16px] font-semibold">Bookings</h2>
        <span className="text-[12px] text-muted">{upcoming ? `${upcoming} coming up` : 'None coming up'}</span>
      </div>
      {!shown.length && <p className="m-0 border-t border-border py-3 text-[13px] text-muted">Bookings paid with a deposit show here: test ones from the pitch link and preview, and real ones from the live site. WhatsApp requests stay in WhatsApp.</p>}
      <ul className="m-0 list-none p-0">
        {shown.map((b) => {
          const s = STATUS[b.status];
          const expanded = open === b.id;
          const past = Date.parse(b.end) < now;
          return (
            <li key={b.id} className="border-t border-border">
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.id)} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left">
                <ChevronRight size={14} className={`flex-none text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[14px] font-medium">
                    {whenLabel(b.start, timezone)} · {b.serviceName}
                  </span>
                  <span className="truncate text-[12px] text-muted">
                    {b.customer.name || 'Customer'}
                    {b.deposit > 0 ? ` · ${formatPrice(b.deposit, b.currency)} deposit` : ''}
                    {b.mode === 'test' ? ' · test' : ''}
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${s.tone}`}>{s.label}</span>
              </button>
              {expanded && (
                <div className="flex flex-col gap-2.5 pb-3.5 pl-[26px] text-[13px]">
                  <div className="flex flex-col gap-0.5 text-muted">
                    {b.customer.phone && <span>{b.customer.phone}</span>}
                    {b.customer.email && <span>{b.customer.email}</span>}
                    {b.customer.note && <span>Note: {b.customer.note}</span>}
                    {b.price > b.deposit && <span>To pay at the appointment: {formatPrice(b.price - b.deposit, b.currency)}</span>}
                    <span className="font-mono text-[12px]">{b.reference}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {b.status === 'confirmed' && past && (
                      <>
                        <button type="button" onClick={() => set(b, 'done')} className="cursor-pointer font-medium text-accent-text hover:underline">
                          Mark done
                        </button>
                        <button type="button" onClick={() => set(b, 'no_show')} className="cursor-pointer font-medium text-muted hover:text-text hover:underline">
                          No-show
                        </button>
                      </>
                    )}
                    {(b.status === 'confirmed' || b.status === 'held') && !past && (
                      <button type="button" onClick={() => set(b, 'cancelled')} className="cursor-pointer font-medium text-danger hover:underline">
                        Cancel and free the time
                      </button>
                    )}
                    {(b.status === 'done' || b.status === 'no_show' || b.status === 'cancelled') && (
                      <button type="button" onClick={() => set(b, 'confirmed')} className="cursor-pointer font-medium text-muted hover:text-text hover:underline">
                        Back to confirmed
                      </button>
                    )}
                  </div>
                  {b.status === 'cancelled' && b.deposit > 0 && <span className="text-muted">Cancelling here doesn’t refund the deposit: refund it in {b.provider === 'stripe' ? 'Stripe' : 'Paystack'} if you need to.</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
