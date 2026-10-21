import { Container, SiteA, type RenderCtx } from '../primitives';
import type { SiteConfig } from '../schema';
import { ClearCart } from './cart';
import { formatPrice } from './format';
import type { Verified } from './payments';

/*
 * What a customer sees after paying: the order, confirmed only once the
 * payment provider says so, or why it didn't go through.
 */
export function OrderView({ config, reference, verified, error, ctx, siteKey, test }: { config: SiteConfig; reference: string; verified: Verified | null; error?: string; ctx: RenderCtx; siteKey: string; test: boolean }) {
  const store = config.store;
  const order = verified?.order;
  const business = config.meta.businessName;
  const shop = config.pages.find((p) => p.sections.some((s) => s.type === 'product-grid'))?.path ?? '/';
  const digits = (store?.whatsapp ?? '').replace(/[^0-9]/g, '');
  const message = `Hello ${business}, about my order ${reference}${order?.customer.name ? ` (${order.customer.name})` : ''}.`;
  const paid = !!verified?.paid && !!order;
  // Paid by bank transfer or USSD, or a payment still being processed: not failed, just not finished.
  const waiting = !paid && /\b(pending|ongoing|processing|queued|in progress)\b/i.test(verified?.reason ?? '');

  return (
    <section className="s-section">
      <Container className="flex max-w-[640px] flex-col gap-6">
        {test && <span className="self-start rounded-full bg-current/10 px-3 py-1 text-[0.8em] font-semibold">Test order · no real money moved</span>}
        <div className="flex flex-col gap-2">
          <h1 className="s-heading s-h2 m-0">
            {paid ? `Thank you${order.customer.name ? `, ${order.customer.name.split(' ')[0]}` : ''}` : error ? 'We couldn’t confirm the payment yet' : waiting ? 'Your payment is still going through' : 'The payment didn’t go through'}
          </h1>
          <p className="m-0 text-site-muted">
            {paid
              ? `Your order is confirmed and paid. Keep the order number below in case you need to ask about it.`
              : error
                ? `${error} If you were charged, refresh this page in a minute, or contact ${business} with the order number below.`
                : waiting
                  ? `Some payments, like bank transfers, take a few minutes to arrive. Refresh this page shortly, or contact ${business} with the order number below.`
                  : `${verified?.reason ? `${verified.reason[0].toUpperCase()}${verified.reason.slice(1)}. ` : ''}Nothing was charged. Your cart is still there to try again.`}
          </p>
        </div>

        {order && (
          <div className="s-outline flex flex-col gap-3 rounded-site-card bg-site-surface p-5">
            <div className="flex justify-between gap-3 text-[0.85em] text-site-muted">
              <span>Order</span>
              <span className="font-mono">{reference}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {order.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {l.qty} × {l.name}
                    {Object.keys(l.options).length > 0 && <span className="text-site-muted"> · {Object.values(l.options).join(', ')}</span>}
                  </span>
                  <span className="font-semibold whitespace-nowrap">{formatPrice(l.price * l.qty, order.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-current/10 pt-3 text-[1.1em] font-semibold">
              <span>{paid ? 'Paid' : 'Total'}</span>
              <span>{formatPrice(order.total, order.currency)}</span>
            </div>
            {order.customer.note && <p className="m-0 text-[0.9em] text-site-muted">Delivery / note: {order.customer.note}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {digits && (
            <a
              href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-site-button bg-[#25D366] px-5 font-semibold text-[#0B3B1F] hover:brightness-105"
            >
              Message {business} on WhatsApp
            </a>
          )}
          <SiteA ctx={ctx} href={shop} className="inline-flex min-h-11 items-center justify-center rounded-site-button border border-current/25 px-5 font-semibold hover:bg-current/5">
            {paid ? 'Back to the shop' : 'Back to the cart'}
          </SiteA>
        </div>
        {paid && <ClearCart site={siteKey} />}
      </Container>
    </section>
  );
}
