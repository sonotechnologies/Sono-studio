import { Container, SiteA, type RenderCtx } from '../primitives';
import type { SiteConfig } from '../schema';
import { durationLabel, whenLabel } from './booking-slots';
import { formatPrice } from './format';
import type { Verified } from './payments';

/*
 * What a customer sees after paying a booking deposit: the appointment,
 * confirmed only once the payment provider says so.
 */

/** An "add to Google Calendar" link for the appointment. */
function calendarLink(title: string, start: string, end: string, details: string): string {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(start)}/${stamp(end)}`, details });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function BookingView({ config, reference, verified, error, ctx, test }: { config: SiteConfig; reference: string; verified: Verified | null; error?: string; ctx: RenderCtx; test: boolean }) {
  const b = config.bookings;
  const order = verified?.order;
  const booking = order?.booking;
  const business = config.meta.businessName;
  const tz = b?.timezone ?? 'UTC';
  const service = b?.services.find((s) => s.id === booking?.serviceId);
  const paid = !!verified?.paid && !!booking;
  const bookPath = config.pages.find((p) => p.sections.some((s) => s.type === 'booking'))?.path ?? '/';
  const digits = (b?.whatsapp ?? '').replace(/[^0-9]/g, '');
  const when = booking ? whenLabel(booking.start, tz) : '';
  const message = `Hello ${business}, about my booking ${reference}${booking ? ` (${booking.serviceName}, ${when})` : ''}.`;
  const balance = service && order ? service.price - order.total : 0;

  return (
    <section className="s-section">
      <Container className="flex max-w-[640px] flex-col gap-6">
        {test && <span className="self-start rounded-full bg-current/10 px-3 py-1 text-[0.8em] font-semibold">Test booking · no real money moved</span>}
        <div className="flex flex-col gap-2">
          <h1 className="s-heading s-h2 m-0">
            {paid ? `You’re booked${order.customer.name ? `, ${order.customer.name.split(' ')[0]}` : ''}` : error ? 'We couldn’t confirm the deposit yet' : 'The deposit didn’t go through'}
          </h1>
          <p className="m-0 text-site-muted">
            {paid
              ? `${business} has your booking. Keep the booking number below in case you need to change it.`
              : error
                ? `${error} If you were charged, refresh this page in a minute, or contact ${business} with the booking number below.`
                : 'Nothing was charged. The time is held for a few minutes: go back and try again, or choose another time.'}
          </p>
        </div>

        {booking && order && (
          <div className="s-outline flex flex-col gap-3 rounded-site-card bg-site-surface p-5">
            <div className="flex justify-between gap-3 text-[0.85em] text-site-muted">
              <span>Booking</span>
              <span className="font-mono">{reference}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[1.1em] font-semibold">{booking.serviceName}</span>
              <span>
                {when}
                {service ? ` · ${durationLabel(service.duration)}` : ''}
              </span>
            </div>
            <div className="flex justify-between border-t border-current/10 pt-3">
              <span>{paid ? 'Deposit paid' : 'Deposit'}</span>
              <span className="font-semibold">{formatPrice(order.total, order.currency)}</span>
            </div>
            {balance > 0 && (
              <div className="flex justify-between text-site-muted">
                <span>To pay at the appointment</span>
                <span>{formatPrice(balance, order.currency)}</span>
              </div>
            )}
            {order.customer.note && <p className="m-0 text-[0.9em] text-site-muted">Note: {order.customer.note}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {paid && booking && (
            <a
              href={calendarLink(`${booking.serviceName} at ${business}`, booking.start, booking.end, `Booking ${reference}`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-site-button bg-site-primary px-5 font-semibold text-site-on-primary hover:brightness-110"
            >
              Add to calendar
            </a>
          )}
          {digits && (
            <a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-site-button border border-current/25 px-5 font-semibold hover:bg-current/5">
              Message {business} on WhatsApp
            </a>
          )}
          {!paid && (
            <SiteA ctx={ctx} href={bookPath} className="inline-flex min-h-11 items-center justify-center rounded-site-button border border-current/25 px-5 font-semibold hover:bg-current/5">
              Back to booking
            </SiteA>
          )}
        </div>
      </Container>
    </section>
  );
}
