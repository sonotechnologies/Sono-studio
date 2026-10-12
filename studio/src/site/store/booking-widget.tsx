'use client';

import { CalendarCheck, Clock, CreditCard } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BookingCtx } from '../primitives';
import type { Bookings, Service } from '../schema';
import { addDays, dayLabel, depositFor, durationLabel, openDays, slotsFor, type Busy } from './booking-slots';
import { formatPrice } from './format';

/*
 * Booking: choose a service, a day and a time, then either pay a deposit by
 * card (the booking is confirmed once it's paid) or send the request on
 * WhatsApp. Times come from the opening hours; where the site has a server,
 * times already booked are left out.
 */

const choice = (on: boolean) =>
  `cursor-pointer rounded-site-input border px-3 py-2 text-left transition-colors ${on ? 'border-site-primary bg-site-primary text-site-on-primary' : 'border-current/20 hover:border-current/50'}`;

export function BookingWidget({ bookings: b, business, category, live }: { bookings: Bookings; business: string; category: string; live?: BookingCtx }) {
  const services = b.services.filter((s) => !category || s.category === category);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const service = services.find((s) => s.id === serviceId) ?? services[0];
  // Worked out after loading, so the server and the visitor's browser agree on "today".
  const [days, setDays] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState<Busy[]>([]);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [start, setStart] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    // Today only while it still has times left for the shortest service.
    const shortest = Math.min(...b.services.map((x) => x.duration), 720);
    const d = openDays(b).filter((day, i) => i > 0 || slotsFor(b, { duration: shortest }, day, []).length > 0);
    setDays(d);
    setDate((cur) => (d.includes(cur) ? cur : (d[0] ?? '')));
  }, [b]);

  useEffect(() => {
    if (!live || !date) return;
    let stale = false;
    setLoadingBusy(true);
    const from = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString();
    const to = new Date(Date.parse(`${addDays(date, 1)}T00:00:00Z`) + 86_400_000).toISOString();
    fetch(`${live.busyEndpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => (r.ok ? r.json() : { busy: [] }))
      .then((j: { busy?: Busy[] }) => !stale && setBusy(j.busy ?? []))
      .catch(() => !stale && setBusy([]))
      .finally(() => !stale && setLoadingBusy(false));
    return () => {
      stale = true;
    };
  }, [live, date]);

  const slots = useMemo(() => (service && date ? slotsFor(b, service, date, busy) : []), [b, service, date, busy]);
  const slot = slots.find((s) => s.start === start);
  useEffect(() => setStart(''), [serviceId, date]);

  if (!service) return <p className="m-0 text-site-muted">Services and booking times appear here once they’re added.</p>;

  const deposit = depositFor(b, service);
  const cards = deposit > 0 ? (live?.providers ?? []).filter((p) => (p === 'paystack' ? b.payments.paystack : b.payments.stripe)) : [];
  const digits = b.whatsapp.replace(/[^0-9]/g, '');
  const whatsapp = b.payments.whatsapp && digits;
  const priceText = service.price > 0 ? formatPrice(service.price, b.currency) : 'Price on request';

  const message = () =>
    [
      `Hello ${business}, I’d like to book:`,
      `• ${service.name} (${durationLabel(service.duration)})`,
      `• ${dayLabel(date)} at ${slot?.label}`,
      name.trim() && `Name: ${name.trim()}`,
      phone.trim() && `Phone: ${phone.trim()}`,
      note.trim() && `Note: ${note.trim()}`,
    ]
      .filter(Boolean)
      .join('\n');

  const pay = async (provider: 'paystack' | 'stripe') => {
    setError('');
    if (!name.trim()) return setError('Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter an email address for the confirmation.');
    setPaying(provider);
    try {
      const res = await fetch(live!.bookEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, serviceId: service.id, start, customer: { name, email, phone, note } }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || 'The booking couldn’t start. Try again.');
      window.location.href = body.url;
    } catch (err) {
      setError((err as Error).message);
      setPaying(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 font-semibold">1. Service</legend>
        <div className="grid gap-2 @3xl:grid-cols-2">
          {services.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === service.id} onClick={() => setServiceId(s.id)} className={`${choice(s.id === service.id)} flex flex-col gap-0.5`}>
              <span className="font-semibold">{s.name}</span>
              <span className="text-[0.85em] opacity-80">
                {durationLabel(s.duration)} · {s.price > 0 ? formatPrice(s.price, b.currency) : 'Price on request'}
              </span>
            </button>
          ))}
        </div>
        {service.description && <p className="m-0 text-[0.9em] text-site-muted">{service.description}</p>}
      </fieldset>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 font-semibold">2. Day</legend>
        {days.length ? (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => (
              <button key={d} type="button" aria-pressed={d === date} onClick={() => setDate(d)} className={`${choice(d === date)} flex-none text-center whitespace-nowrap`}>
                {dayLabel(d)}
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 text-site-muted">No days open for booking right now.</p>
        )}
      </fieldset>

      {date && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 font-semibold">3. Time</legend>
          {loadingBusy ? (
            <p className="m-0 text-site-muted">Checking free times…</p>
          ) : slots.length ? (
            <div className="grid grid-cols-4 gap-2 @3xl:grid-cols-6">
              {slots.map((s) => (
                <button key={s.start} type="button" aria-pressed={s.start === start} onClick={() => setStart(s.start)} className={`${choice(s.start === start)} text-center`}>
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="m-0 text-site-muted">No free times that day. Try another day.</p>
          )}
        </fieldset>
      )}

      {slot && (
        <div className="flex flex-col gap-3">
          <span className="font-semibold">4. Your details</span>
          <div className="s-outline flex flex-wrap items-center gap-x-4 gap-y-1 rounded-site-card bg-site-surface p-3 text-[0.9em]">
            <span className="flex items-center gap-1.5 font-semibold">
              <CalendarCheck size={16} aria-hidden /> {service.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={15} aria-hidden /> {dayLabel(date)}, {slot.label}
            </span>
            <span>{priceText}</span>
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" className="min-h-11 rounded-site-input border border-current/20 bg-transparent px-3" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone" aria-label="Phone" autoComplete="tel" className="min-h-11 rounded-site-input border border-current/20 bg-transparent px-3" />
          {cards.length > 0 && (
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email, for the confirmation" aria-label="Email" autoComplete="email" className="min-h-11 rounded-site-input border border-current/20 bg-transparent px-3" />
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything we should know (optional)" aria-label="Note" className="rounded-site-input border border-current/20 bg-transparent px-3 py-2" />
          {error && (
            <p role="alert" className="m-0 text-[0.9em] text-[#C2410C]">
              {error}
            </p>
          )}
          {cards.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!!paying}
              onClick={() => pay(p)}
              className="inline-flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-site-button bg-site-primary px-5 py-1.5 font-semibold text-site-on-primary hover:brightness-110 disabled:cursor-default disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <CreditCard size={17} aria-hidden />
                {paying === p ? 'Opening the payment page…' : `Pay ${formatPrice(deposit, b.currency)} deposit and book`}
              </span>
              <span className="text-[0.75em] font-normal opacity-80">
                {p === 'paystack' ? 'Paystack: card, bank transfer or mobile money' : 'Card, Apple Pay or Google Pay'}
                {service.price > deposit ? ` · ${formatPrice(service.price - deposit, b.currency)} at the appointment` : ''}
              </span>
            </button>
          ))}
          {whatsapp ? (
            <a
              href={`https://wa.me/${digits}?text=${encodeURIComponent(message())}`}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex min-h-12 items-center justify-center rounded-site-button px-5 font-semibold ${cards.length ? 'border border-current/25 hover:bg-current/5' : 'bg-[#25D366] text-[#0B3B1F] hover:brightness-105'}`}
            >
              {cards.length ? 'Ask on WhatsApp instead' : 'Request this time on WhatsApp'}
            </a>
          ) : (
            !cards.length && <p className="m-0 text-[0.9em] text-site-muted">Online booking opens soon.</p>
          )}
          {live?.test && cards.length > 0 && (
            <p className="m-0 rounded-site-input bg-current/5 p-2.5 text-[0.8em] leading-snug text-site-muted">
              <strong>Test mode:</strong> no real money moves. {cards.includes('paystack') && 'Paystack test card 4084 0840 8408 4081, any future date, CVV 408, PIN 0000, OTP 123456. '}
              {cards.includes('stripe') && 'Stripe test card 4242 4242 4242 4242, any future date and CVC.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
