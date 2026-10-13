'use client';

import { AlertTriangle, ArrowDown, ArrowUp, CalendarPlus, ChevronLeft, Copy, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { inputClass, Switch } from '@/components/ui';
import type { Bookings, Service, SiteConfig } from '@/site/schema';
import { durationLabel } from '@/site/store/booking-slots';
import { formatPrice } from '@/site/store/format';
import { PAYSTACK_CURRENCIES } from '@/site/store/payments-info';
import { addBookings, DAY_NAMES, moveService, newService, removeService, saveService, serviceId, setBookings, TIMEZONES } from '@/workspace/bookings';
import { CURRENCIES } from '@/workspace/store';

/*
 * The Bookings tab: services, opening hours, booking rules, the deposit and
 * how people pay it. The booking section on the site reads all of this.
 */

const field = `${inputClass} rounded-[10px] bg-bg px-[11px] text-[14px]`;
const pill = 'flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium hover:bg-hover disabled:cursor-default disabled:opacity-40';
const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
// Monday first, as most people read a week.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos';
  } catch {
    return 'Africa/Lagos';
  }
}

export function BookingsPanel({
  config,
  onChange,
  onAdd,
  testKeys,
  limited = false,
}: {
  config: SiteConfig;
  onChange: (next: SiteConfig, summary: string, coalesce?: string) => void;
  onAdd: (opts: { currency: string; timezone: string }) => void;
  testKeys: { paystack: boolean; stripe: boolean };
  /** The client admin: services, hours and rules, but not the deposit, payments, currency or time zone. */
  limited?: boolean;
}) {
  const b = config.bookings;
  const [openId, setOpenId] = useState<string | null>(null);
  const [currency, setCurrency] = useState(config.store?.currency ?? 'NGN');
  const [timezone, setTimezone] = useState(browserZone);

  if (!b) {
    return (
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-bg p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-sel">
            <CalendarPlus size={18} />
          </span>
          <div className="text-[16px] font-semibold">Take bookings on this site</div>
          <p className="m-0 text-[13px] leading-normal text-muted">
            Adds a Book page and a Book link in the menu, with sample services and Monday to Saturday hours to adjust. Visitors pick a service and a free time, then pay a deposit by card or send the request on WhatsApp.
          </p>
          <label className="flex items-center gap-3 text-[13px] font-medium">
            <span className="w-16">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${field} h-9 w-28 cursor-pointer`}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 text-[13px] font-medium">
            <span className="w-16">Time zone</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${field} h-9 min-w-0 flex-1 cursor-pointer`}>
              {[...new Set([timezone, ...TIMEZONES])].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onAdd({ currency, timezone })} className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 text-[14px] font-semibold text-white hover:bg-terracotta-hover">
            <Plus size={16} />
            Add bookings
          </button>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Bookings>, summary: string) => onChange(setBookings(config, patch), summary, `bookings:${summary}`);
  const service = openId ? b.services.find((s) => s.id === openId) : undefined;

  if (service) {
    const index = b.services.indexOf(service);
    const save = (next: Service, key: string) => onChange(saveService(config, { ...next, sample: undefined }), service.name, `service:${service.id}:${key}`);
    return (
      <div className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setOpenId(null)} className="flex cursor-pointer items-center gap-1 self-start text-[13px] text-muted hover:text-text">
            <ChevronLeft size={15} />
            All services
          </button>
          <div className="truncate text-[20px] font-semibold tracking-[-0.01em]">{service.name}</div>
          {service.sample && <Warn>This is a sample service. Editing it marks it as real.</Warn>}
        </div>
        <TextInput label="Name" value={service.name} onCommit={(v) => v && save({ ...service, name: v }, 'name')} />
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-medium">
            Length
            <select value={service.duration} onChange={(e) => save({ ...service, duration: Number(e.target.value) }, 'duration')} className={`${field} h-[38px] cursor-pointer`}>
              {[...new Set([service.duration, ...DURATIONS])].sort((x, y) => x - y).map((d) => (
                <option key={d} value={d}>
                  {durationLabel(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-medium">
            Price
            <span className="relative flex">
              <input
                key={service.price}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                defaultValue={service.price || ''}
                placeholder="On request"
                onBlur={(e) => {
                  const v = Math.max(0, Number(e.target.value || 0));
                  if (Number.isFinite(v) && v !== service.price) save({ ...service, price: v }, 'price');
                }}
                className={`${field} h-[38px] w-full pr-12`}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{b.currency}</span>
            </span>
          </label>
        </div>
        <TextInput label="Category" value={service.category} placeholder="e.g. Hair, Nails, Massage" onCommit={(v) => save({ ...service, category: v }, 'category')} />
        <TextInput label="Description" value={service.description} multiline onCommit={(v) => save({ ...service, description: v }, 'description')} />
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={index === 0} onClick={() => onChange(moveService(config, service.id, index - 1), 'Service order')} className={pill}>
            <ArrowUp size={14} />
            Move up
          </button>
          <button type="button" disabled={index === b.services.length - 1} onClick={() => onChange(moveService(config, service.id, index + 1), 'Service order')} className={pill}>
            <ArrowDown size={14} />
            Move down
          </button>
          <button
            type="button"
            onClick={() => {
              const copy = { ...service, id: serviceId(config, `${service.name} copy`), name: `${service.name} (copy)`.slice(0, 80), sample: undefined };
              onChange(moveService(saveService(config, copy), copy.id, index + 1), `Duplicated ${service.name}`);
              setOpenId(copy.id);
            }}
            className={pill}
          >
            <Copy size={14} />
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(removeService(config, service.id), `Removed ${service.name}`);
              setOpenId(null);
            }}
            className={`${pill} border-transparent text-danger`}
          >
            <Trash2 size={14} />
            Remove
          </button>
        </div>
      </div>
    );
  }

  const samples = b.services.filter((s) => s.sample).length;
  const digits = b.whatsapp.replace(/[^0-9]/g, '');
  const paystackCurrency = PAYSTACK_CURRENCIES.includes(b.currency);
  const cards = b.depositPercent > 0 && (b.payments.paystack || b.payments.stripe);

  return (
    <div className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
      <div className="flex flex-col gap-3">
        <div className="text-[20px] font-semibold tracking-[-0.01em]">Bookings</div>
        {samples > 0 && <Warn>{samples === 1 ? 'One service is a sample' : `${samples} services are samples`}. Replace them with the client’s real services.</Warn>}
        {!digits && !cards && <Warn>Add a WhatsApp number or switch on a deposit, or visitors can’t book.</Warn>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">
          Services <span className="font-normal text-muted">· {b.services.length}</span>
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {b.services.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-hover">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium">{s.name}</span>
                  <span className="truncate text-[12px] text-muted">
                    {durationLabel(s.duration)} · {s.price > 0 ? formatPrice(s.price, b.currency) : 'Price on request'}
                    {s.category ? ` · ${s.category}` : ''}
                  </span>
                </span>
                {s.sample && <span className="flex-none rounded-full bg-sel px-2 py-0.5 text-[11px] font-medium text-muted">Sample</span>}
              </button>
            </li>
          ))}
        </ul>
        {b.services.length < 60 && (
          <button
            type="button"
            onClick={() => {
              const s = newService(config);
              onChange(saveService(config, s), 'Added a service');
              setOpenId(s.id);
            }}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted hover:bg-hover hover:text-text"
          >
            <Plus size={14} />
            Add service
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Opening hours</span>
        {WEEK.map((day) => {
          const spans = b.hours.filter((h) => h.day === day);
          const span = spans[0];
          const others = b.hours.filter((h) => h.day !== day);
          const setDay = (next: Bookings['hours']) => set({ hours: [...others, ...next].sort((x, y) => x.day - y.day || x.open.localeCompare(y.open)) }, 'Opening hours');
          return (
            <div key={day} className="flex min-h-9 items-center gap-2 text-[13px]">
              <Switch on={!!span} label={`Open on ${DAY_NAMES[day]}`} size="sm" onChange={(v) => setDay(v ? [{ day, open: '09:00', close: '18:00' }] : [])} />
              <span className="w-9 flex-none">{DAY_NAMES[day].slice(0, 3)}</span>
              {span ? (
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {spans.map((sp, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <TimeInput label={`${DAY_NAMES[day]} opens`} value={sp.open} onCommit={(v) => v < sp.close && setDay(spans.map((x, j) => (j === i ? { ...x, open: v } : x)))} />
                      <span className="text-muted">–</span>
                      <TimeInput label={`${DAY_NAMES[day]} closes`} value={sp.close} onCommit={(v) => v > sp.open && setDay(spans.map((x, j) => (j === i ? { ...x, close: v } : x)))} />
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-muted">Closed</span>
              )}
            </div>
          );
        })}
        <p className="m-0 text-[12px] text-muted">Times are in {b.timezone.replace(/_/g, ' ')}.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Start times every" value={b.step} options={[10, 15, 20, 30, 45, 60, 90, 120].map((m) => [m, durationLabel(m)])} onChange={(v) => set({ step: v }, 'Start times')} />
        <Select label="At the same time" value={b.capacity} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, n === 1 ? 'One booking' : `${n} bookings`])} onChange={(v) => set({ capacity: v }, 'Capacity')} />
        <Select label="Notice needed" value={b.notice} options={[0, 1, 2, 4, 12, 24, 48, 72].map((h) => [h, h === 0 ? 'None' : h < 24 ? `${h} h` : `${h / 24} day${h > 24 ? 's' : ''}`])} onChange={(v) => set({ notice: v }, 'Notice')} />
        <Select label="Book up to" value={b.daysAhead} options={[7, 14, 30, 60, 90, 180].map((d) => [d, `${d} days ahead`])} onChange={(v) => set({ daysAhead: v }, 'Days ahead')} />
      </div>

      <ClosedDates dates={b.closed} onChange={(closed) => set({ closed }, 'Closed days')} />

      {!limited && (
      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-medium">Deposit and payment</span>
        <Select
          label="Deposit"
          value={b.depositPercent}
          options={[0, 10, 20, 25, 30, 50, 100].map((p) => [p, p === 0 ? 'No deposit (WhatsApp requests)' : p === 100 ? 'Full price upfront' : `${p}% upfront`])}
          onChange={(v) => set({ depositPercent: v }, 'Deposit')}
        />
        <Toggle label="Requests on WhatsApp" note="The chosen service and time are sent as a pre-filled message to confirm in the chat." on={b.payments.whatsapp} onChange={(v) => (v || b.payments.paystack || b.payments.stripe) && set({ payments: { ...b.payments, whatsapp: v } }, 'Payments')} />
        <Toggle
          label="Deposit with Paystack"
          note="Card, bank transfer or mobile money; the booking is confirmed once paid."
          on={b.payments.paystack}
          onChange={(v) => (v || b.payments.whatsapp || b.payments.stripe) && set({ payments: { ...b.payments, paystack: v } }, 'Payments')}
          warn={!paystackCurrency ? `Paystack doesn’t charge in ${b.currency}.` : b.payments.paystack && !testKeys.paystack ? 'Add your Paystack test key in Settings → Test payments to try it on the pitch link.' : undefined}
        />
        <Toggle
          label="Deposit with Stripe"
          note="International cards, Apple Pay and Google Pay."
          on={b.payments.stripe}
          onChange={(v) => (v || b.payments.whatsapp || b.payments.paystack) && set({ payments: { ...b.payments, stripe: v } }, 'Payments')}
          warn={b.payments.stripe && !testKeys.stripe ? 'Add your Stripe test key in Settings → Test payments to try it on the pitch link.' : undefined}
        />
        {b.depositPercent === 0 && (b.payments.paystack || b.payments.stripe) && <span className="text-[12px] text-warn">Card payments only apply once a deposit is chosen.</span>}
      </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-medium">Business details</span>
        <div className="flex gap-3">
          <label className="flex w-28 flex-col gap-1.5 text-[13px] font-medium">
            Currency
            <select disabled={limited} value={b.currency} onChange={(e) => set({ currency: e.target.value }, 'Currency')} className={`${field} h-[38px] cursor-pointer`}>
              {[...new Set([b.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <TextInput label="WhatsApp" value={b.whatsapp} placeholder="+234 803 000 0000" onCommit={(v) => set({ whatsapp: v }, 'WhatsApp number')} />
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Time zone
          <select disabled={limited} value={b.timezone} onChange={(e) => set({ timezone: e.target.value }, 'Time zone')} className={`${field} h-[38px] cursor-pointer`}>
            {[...new Set([b.timezone, ...TIMEZONES])].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex gap-2 rounded-[10px] bg-warn-bg p-3 text-[13px] text-warn">
      <AlertTriangle size={15} className="mt-0.5 flex-none" />
      <span>{children}</span>
    </div>
  );
}

function TextInput({ label, value, placeholder, multiline, onCommit }: { label: string; value: string; placeholder?: string; multiline?: boolean; onCommit: (v: string) => void }) {
  const commit = (v: string) => v.trim() !== value && onCommit(v.trim());
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium">
      {label}
      {multiline ? (
        <textarea key={value} defaultValue={value} rows={3} placeholder={placeholder} onBlur={(e) => commit(e.target.value)} className={`${field} resize-y py-[9px] leading-[1.45]`} />
      ) : (
        <input key={value} defaultValue={value} placeholder={placeholder} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${field} h-[38px]`} />
      )}
    </label>
  );
}

// Every quarter hour, as 24-hour times: short and the same in every browser.
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

function TimeInput({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => e.target.value !== value && onCommit(e.target.value)} className={`${field} h-8 w-[90px] cursor-pointer px-2 text-[13px]`}>
      {(TIMES.includes(value) ? TIMES : [value, ...TIMES]).map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: number; options: [number, string][]; onChange: (v: number) => void }) {
  const all = options.some(([v]) => v === value) ? options : [[value, String(value)] as [number, string], ...options];
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${field} h-[38px] cursor-pointer`}>
        {all.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, note, on, onChange, warn }: { label: string; note: string; on: boolean; onChange: (v: boolean) => void; warn?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-medium">{label}</span>
          <span className="text-[12px] leading-snug text-muted">{note}</span>
        </span>
        <Switch on={on} label={label} size="sm" onChange={onChange} />
      </div>
      {warn && <span className="text-[12px] leading-snug text-warn">{warn}</span>}
    </div>
  );
}

function ClosedDates({ dates, onChange }: { dates: string[]; onChange: (d: string[]) => void }) {
  const [adding, setAdding] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = dates.filter((d) => d >= today).sort();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium">Closed days</span>
      {upcoming.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {upcoming.map((d) => (
            <li key={d} className="flex items-center gap-1 rounded-full bg-sel py-1 pr-1 pl-2.5 text-[12px]">
              {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
              <button type="button" aria-label={`Open on ${d}`} onClick={() => onChange(dates.filter((x) => x !== d))} className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-hover">
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input type="date" min={today} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add a closed day" className={`${field} h-9 min-w-0 flex-1 text-[13px]`} />
        <button
          type="button"
          disabled={!adding || dates.includes(adding)}
          onClick={() => {
            // Past closed days are dropped as new ones are added.
            onChange([...dates.filter((d) => d >= today), adding].sort().slice(-60));
            setAdding('');
          }}
          className={pill}
        >
          Add
        </button>
      </div>
      <span className="text-[12px] text-muted">Holidays and days off, on top of the weekly hours.</span>
    </div>
  );
}
