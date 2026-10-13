'use client';

import { ChevronRight } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui';
import type { OrderRecord, OrderStatus } from '@/lib/data/repo';
import { compactWhen } from '@/lib/format';
import { formatPrice } from '@/site/store/format';
import { setOrderStatusAction } from '../actions';

const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  pending: { label: 'Not paid', tone: 'bg-sel text-muted' },
  paid: { label: 'Paid', tone: 'bg-success-bg text-success' },
  failed: { label: 'Failed', tone: 'bg-sel text-danger' },
  fulfilled: { label: 'Fulfilled', tone: 'bg-sel text-text' },
  cancelled: { label: 'Cancelled', tone: 'bg-sel text-muted' },
};

/** Orders paid on the shop: test orders from the pitch link and preview, and live ones from the deployed site. */
export function OrdersCard({ projectId, orders: initial, now, onSetStatus }: { projectId: string; orders: OrderRecord[]; now: number; onSetStatus?: (id: string, status: OrderStatus) => Promise<unknown> }) {
  const toast = useToast();
  const [orders, setOrders] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [, start] = useTransition();
  // Checkouts that were never paid are noise once they're a day old.
  const visible = orders.filter((o) => showAll || o.status !== 'pending' || now - new Date(o.createdAt).getTime() < 86_400_000);
  const hidden = orders.length - visible.length;
  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'fulfilled');
  const live = paid.filter((o) => o.mode === 'live');

  const set = (o: OrderRecord, status: OrderStatus) => {
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, status } : x)));
    start(async () => {
      try {
        await (onSetStatus ? onSetStatus(o.id, status) : setOrderStatusAction(projectId, o.id, status));
      } catch {
        setOrders((list) => list.map((x) => (x.id === o.id ? o : x)));
        toast('Couldn’t update the order');
      }
    });
  };

  return (
    <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-[18px]">
      <div className="flex items-baseline gap-2 pb-2">
        <h2 className="m-0 flex-1 text-[16px] font-semibold">Orders</h2>
        <span className="text-[12px] text-muted">
          {live.length ? `${live.length} paid on the live site` : paid.length ? `${paid.length} paid test order${paid.length === 1 ? '' : 's'}` : 'None paid yet'}
        </span>
      </div>
      {!visible.length && <p className="m-0 border-t border-border py-3 text-[13px] text-muted">Card payments from the shop show here: test orders from the pitch link and preview, and paid orders from the live site.</p>}
      <ul className="m-0 list-none p-0">
        {visible.map((o) => {
          const s = STATUS[o.status];
          const expanded = open === o.id;
          return (
            <li key={o.id} className="border-t border-border">
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left">
                <ChevronRight size={14} className={`flex-none text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[14px] font-medium">
                    {o.customer.name || 'Customer'} · {formatPrice(o.total, o.currency)}
                  </span>
                  <span className="truncate text-[12px] text-muted">
                    {o.lines.reduce((n, l) => n + l.qty, 0)} item{o.lines.reduce((n, l) => n + l.qty, 0) === 1 ? '' : 's'} · {o.provider === 'paystack' ? 'Paystack' : 'Stripe'}
                    {o.mode === 'test' ? ' · test' : ''}
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${s.tone}`}>{s.label}</span>
                <span className="w-14 text-right text-[12px] whitespace-nowrap text-muted">{compactWhen(o.createdAt, now)}</span>
              </button>
              {expanded && (
                <div className="flex flex-col gap-2.5 pb-3.5 pl-[26px] text-[13px]">
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {o.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>
                          {l.qty} × {l.name}
                          {Object.keys(l.options).length > 0 && <span className="text-muted"> · {Object.values(l.options).join(', ')}</span>}
                        </span>
                        <span className="whitespace-nowrap">{formatPrice(l.price * l.qty, o.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-0.5 text-muted">
                    {o.customer.email && <span>{o.customer.email}</span>}
                    {o.customer.phone && <span>{o.customer.phone}</span>}
                    {o.customer.note && <span>Delivery / note: {o.customer.note}</span>}
                    <span className="font-mono text-[12px]">{o.reference}</span>
                  </div>
                  {(o.status === 'paid' || o.status === 'fulfilled' || o.status === 'cancelled') && (
                    <div className="flex flex-wrap gap-3">
                      {o.status !== 'fulfilled' && (
                        <button type="button" onClick={() => set(o, 'fulfilled')} className="cursor-pointer font-medium text-accent-text hover:underline">
                          Mark fulfilled
                        </button>
                      )}
                      {o.status !== 'paid' && (
                        <button type="button" onClick={() => set(o, 'paid')} className="cursor-pointer font-medium text-muted hover:text-text hover:underline">
                          Back to paid
                        </button>
                      )}
                      {o.status !== 'cancelled' && (
                        <button type="button" onClick={() => set(o, 'cancelled')} className="cursor-pointer font-medium text-danger hover:underline">
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                  {o.status === 'cancelled' && <span className="text-muted">Cancelling here doesn’t refund the customer: refund it in {o.provider === 'paystack' ? 'Paystack' : 'Stripe'}.</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="cursor-pointer self-start pt-1 text-[13px] font-medium text-muted hover:text-text hover:underline">
          Show {hidden} unpaid checkout{hidden === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}
