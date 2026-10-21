import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Bookings, PaymentProvider, Service, Store } from '../schema';
import { depositFor, slotFree, whenLabel, type Busy, type Slot } from './booking-slots';
import { cardProviders, depositProviders, fromMinor, minorUnits } from './payments-info';

/*
 * Card checkout with Paystack or Stripe, on the server only. The same code
 * runs in the studio (pitch links, in test mode) and in an exported site
 * (the business's own keys). Prices always come from the site's own product
 * list, never from the browser, and an order counts as paid only once the
 * provider confirms it, server to server.
 */

type Fetch = typeof fetch;

// Only changed in tests, to point at a local stand-in for the provider.
const PAYSTACK_API = process.env.SONO_PAYSTACK_API_URL || 'https://api.paystack.co';
const STRIPE_API = process.env.SONO_STRIPE_API_URL || 'https://api.stripe.com/v1';

export class PaymentError extends Error {}

/** What a provider-hosted payment page is asked for, and what comes back once it's paid. */
export interface Order {
  reference: string;
  provider: PaymentProvider;
  currency: string;
  /** In the store's currency, e.g. 4500 or 12.5. */
  total: number;
  lines: { productId: string; name: string; options: Record<string, string>; qty: number; price: number }[];
  customer: { name: string; email: string; phone: string; note: string };
  /** Set when the payment is a booking's deposit. */
  booking?: { serviceId: string; serviceName: string; start: string; end: string };
}

export interface Verified {
  paid: boolean;
  /** Why it isn't paid, in the provider's words, when it isn't. */
  reason?: string;
  order: Order | null;
}

/* ---------- Which providers and currencies ---------- */

export { cardProviders, depositProviders, minorUnits, fromMinor, PAYSTACK_CURRENCIES, whatsappOn } from './payments-info';

/* ---------- The cart, priced on the server ---------- */

export interface CheckoutRequest {
  provider: PaymentProvider;
  lines: { productId: string; options?: Record<string, string>; qty: number }[];
  customer: { name?: string; email?: string; phone?: string; note?: string };
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Checks a checkout request against the store and prices it from the product list. */
export function priceCart(store: Store, body: unknown): Omit<Order, 'reference'> {
  const req = (body ?? {}) as Partial<CheckoutRequest>;
  if (req.provider !== 'paystack' && req.provider !== 'stripe') throw new PaymentError('Choose a way to pay.');
  if (!cardProviders(store).includes(req.provider)) throw new PaymentError('That way to pay isn’t available here.');
  if (!Array.isArray(req.lines) || !req.lines.length || req.lines.length > 50) throw new PaymentError('The cart is empty.');
  const lines: Order['lines'] = [];
  for (const raw of req.lines) {
    const product = store.products.find((p) => p.id === raw?.productId);
    if (!product) throw new PaymentError('Something in the cart is no longer sold. Remove it and try again.');
    if (product.soldOut) throw new PaymentError(`${product.name} is sold out. Remove it and try again.`);
    if (product.sample || product.price <= 0) throw new PaymentError(`${product.name} has no price yet.`);
    const qty = Math.floor(Number(raw.qty));
    if (!(qty >= 1 && qty <= 99)) throw new PaymentError('Check the quantities in the cart.');
    // Only the product's own options, with one of its own values.
    const options: Record<string, string> = {};
    for (const group of product.options ?? []) {
      const chosen = raw.options?.[group.name];
      options[group.name] = chosen && group.values.includes(chosen) ? chosen : group.values[0];
    }
    // Each price in the currency's smallest unit, as the payment providers charge it.
    lines.push({ productId: product.id, name: product.name, options, qty, price: fromMinor(minorUnits(product.price, store.currency), store.currency) });
  }
  const c = req.customer ?? {};
  const customer = { name: clip(c.name, 80), email: clip(c.email, 120), phone: clip(c.phone, 32), note: clip(c.note, 400) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new PaymentError('Enter an email address for the receipt.');
  if (!customer.name) throw new PaymentError('Enter your name.');
  const total = fromMinor(lines.reduce((s, l) => s + minorUnits(l.price, store.currency) * l.qty, 0), store.currency);
  return { provider: req.provider, currency: store.currency, total, lines, customer };
}

/**
 * Whether a paid order matches the shop's own prices. A payment page can be
 * started by anyone who has the shop's public key, with any order attached,
 * so a paid order only counts if pricing it again gives the amount paid.
 */
export function orderFitsStore(store: Store | undefined, order: Order): boolean {
  if (!store || order.booking) return false;
  try {
    const again = priceCart(
      { ...store, products: store.products.map((p) => ({ ...p, soldOut: false })) },
      { provider: order.provider, lines: order.lines.map((l) => ({ productId: l.productId, options: l.options, qty: l.qty })), customer: order.customer },
    );
    return again.currency === order.currency && minorUnits(again.total, again.currency) === minorUnits(order.total, order.currency);
  } catch {
    return false;
  }
}

/**
 * Checks a booking request against the services and free times, and works out
 * the deposit. `busy` is what's already taken around that time.
 */
export function priceBooking(b: Bookings, body: unknown, busy: Busy[], now: Date = new Date()): { order: Omit<Order, 'reference'>; service: Service; slot: Slot } {
  const req = (body ?? {}) as { provider?: string; serviceId?: string; start?: string; customer?: CheckoutRequest['customer'] };
  if (req.provider !== 'paystack' && req.provider !== 'stripe') throw new PaymentError('Choose a way to pay.');
  if (!depositProviders(b).includes(req.provider)) throw new PaymentError('That way to pay isn’t available here.');
  const service = b.services.find((s) => s.id === req.serviceId);
  if (!service || service.sample) throw new PaymentError('That service isn’t offered any more. Choose another.');
  const deposit = depositFor(b, service);
  if (deposit <= 0) throw new PaymentError('This service doesn’t take a deposit. Book it on WhatsApp instead.');
  const slot = typeof req.start === 'string' ? slotFree(b, service, req.start, busy, now) : null;
  if (!slot) throw new PaymentError('That time isn’t free any more. Choose another.');
  const c = req.customer ?? {};
  const customer = { name: clip(c.name, 80), email: clip(c.email, 120), phone: clip(c.phone, 32), note: clip(c.note, 400) };
  if (!customer.name) throw new PaymentError('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new PaymentError('Enter an email address for the confirmation.');
  return {
    service,
    slot,
    order: {
      provider: req.provider,
      currency: b.currency,
      total: deposit,
      lines: [{ productId: service.id, name: `Deposit: ${service.name}, ${whenLabel(slot.start, b.timezone)}`, options: {}, qty: 1, price: deposit }],
      customer,
      booking: { serviceId: service.id, serviceName: service.name, start: slot.start, end: slot.end },
    },
  };
}

/** A reference both providers accept and nobody can guess. */
export function newReference(site: string): string {
  const prefix = site.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'order';
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
}

export const lineLabel = (l: Pick<Order['lines'][number], 'name' | 'options'>) =>
  Object.keys(l.options).length ? `${l.name} (${Object.entries(l.options).map(([k, v]) => `${k}: ${v}`).join(', ')})` : l.name;

/* ---------- Paystack ---------- */

async function paystack<T>(f: Fetch, secret: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await f(`${PAYSTACK_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PaymentError('Paystack couldn’t be reached. Try again in a moment.');
  }
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (res.status === 401) throw new PaymentError('Card payments aren’t set up correctly for this shop (the payment key was rejected).');
  if (!res.ok || !json?.status) throw new PaymentError(`Paystack: ${json?.message ?? `error ${res.status}`}`);
  return json.data as T;
}

export async function startPaystack(opts: { secret: string; order: Order; returnUrl: string; cancelUrl: string; fetch?: Fetch }): Promise<string> {
  const { order } = opts;
  const data = await paystack<{ authorization_url: string }>(opts.fetch ?? fetch, opts.secret, 'POST', '/transaction/initialize', {
    email: order.customer.email,
    amount: minorUnits(order.total, order.currency),
    currency: order.currency,
    reference: order.reference,
    callback_url: opts.returnUrl,
    // The order travels with the payment, so verifying it needs no database.
    metadata: { order, cancel_action: opts.cancelUrl },
  });
  return data.authorization_url;
}

type PaystackTx = { status: string; reference: string; amount: number; currency: string; gateway_response?: string; metadata?: unknown };

function orderFromPaystack(tx: PaystackTx): Order | null {
  const meta = typeof tx.metadata === 'string' ? (JSON.parse(tx.metadata || '{}') as { order?: Order }) : (tx.metadata as { order?: Order } | null);
  return meta?.order && meta.order.reference === tx.reference ? meta.order : null;
}

export function checkPaystack(tx: PaystackTx): Verified {
  const order = orderFromPaystack(tx);
  if (!order) return { paid: false, reason: 'Unknown order', order: null };
  const paid = tx.status === 'success' && tx.currency === order.currency && tx.amount === minorUnits(order.total, order.currency);
  return { paid, reason: paid ? undefined : tx.gateway_response || tx.status, order };
}

export async function verifyPaystack(opts: { secret: string; reference: string; fetch?: Fetch }): Promise<Verified> {
  const tx = await paystack<PaystackTx>(opts.fetch ?? fetch, opts.secret, 'GET', `/transaction/verify/${encodeURIComponent(opts.reference)}`);
  return checkPaystack(tx);
}

/** Paystack signs each webhook with the secret key: HMAC-SHA512 of the raw body. */
export function paystackSignatureOk(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  return safeEqual(createHmac('sha512', secret).update(rawBody).digest('hex'), signature);
}

/* ---------- Stripe ---------- */

function form(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...form(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

async function stripe<T>(f: Fetch, secret: string, method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await f(`${STRIPE_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? form(body).join('&') : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PaymentError('Stripe couldn’t be reached. Try again in a moment.');
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (res.status === 401) throw new PaymentError('Card payments aren’t set up correctly for this shop (the payment key was rejected).');
  if (!res.ok || !json) throw new PaymentError(`Stripe: ${json?.error?.message ?? `error ${res.status}`}`);
  return json;
}

export async function startStripe(opts: { secret: string; order: Order; returnUrl: string; cancelUrl: string; fetch?: Fetch }): Promise<string> {
  const { order } = opts;
  const cur = order.currency.toLowerCase();
  const items = Object.fromEntries(
    order.lines.map((l, i) => [i, { price_data: { currency: cur, unit_amount: minorUnits(l.price, order.currency), product_data: { name: lineLabel(l).slice(0, 250) } }, quantity: l.qty }]),
  );
  const session = await stripe<{ url: string }>(opts.fetch ?? fetch, opts.secret, 'POST', '/checkout/sessions', {
    mode: 'payment',
    // Stripe fills in the session id; the order page checks it with Stripe.
    success_url: `${opts.returnUrl}${opts.returnUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl,
    client_reference_id: order.reference,
    customer_email: order.customer.email,
    line_items: items,
    // Stripe metadata values are capped at 500 characters, so longer values go in numbered pieces.
    metadata: {
      reference: order.reference,
      total: String(order.total),
      currency: order.currency,
      ...pieces('customer', JSON.stringify(order.customer)),
      ...pieces('lines', JSON.stringify(order.lines.map((l) => [l.productId, l.qty, l.price, l.options]))),
      ...(order.booking ? pieces('booking', JSON.stringify(order.booking)) : {}),
    },
    // A deposit's time is held for 30 minutes: the payment page closes soon after (Stripe's shortest).
    ...(order.booking ? { expires_at: Math.floor(Date.now() / 1000) + 31 * 60 } : {}),
  });
  return session.url;
}

type StripeSession = {
  id: string;
  payment_status: string;
  status: string;
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  metadata?: Record<string, string>;
  line_items?: { data: { description: string; quantity: number; amount_total: number }[] };
};

/** A value split into metadata keys of at most 500 characters: name, name_1, name_2… */
function pieces(name: string, value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i * 500 < value.length && i < 12; i++) out[i ? `${name}_${i}` : name] = value.slice(i * 500, (i + 1) * 500);
  return out;
}

const joined = (m: Record<string, string>, name: string) => {
  let v = m[name] ?? '';
  for (let i = 1; m[`${name}_${i}`] !== undefined; i++) v += m[`${name}_${i}`];
  return v;
};

export function checkStripe(s: StripeSession): Verified {
  const m = s.metadata ?? {};
  if (!m.reference || m.reference !== s.client_reference_id) return { paid: false, reason: 'Unknown order', order: null };
  const currency = (m.currency || s.currency).toUpperCase();
  let customer: Order['customer'] = { name: '', email: '', phone: '', note: '' };
  try {
    customer = { ...customer, ...(JSON.parse(joined(m, 'customer') || '{}') as Partial<Order['customer']>) };
  } catch {}
  let packed: [string, number, number, Record<string, string>][] = [];
  try {
    packed = JSON.parse(joined(m, 'lines') || '[]');
  } catch {}
  const items = s.line_items?.data ?? [];
  const lines: Order['lines'] = items.map((it, i) => ({
    productId: packed[i]?.[0] ?? '',
    // The line was sent as "Tee (Size: M)"; the options are kept separately.
    name: packed[i] && Object.keys(packed[i][3] ?? {}).length ? it.description.replace(/ \([^()]*\)$/, '') : it.description,
    options: packed[i]?.[3] ?? {},
    qty: it.quantity,
    price: fromMinor(it.amount_total, currency) / Math.max(1, it.quantity),
  }));
  const total = Number(m.total);
  let booking: Order['booking'];
  try {
    booking = m.booking ? (JSON.parse(joined(m, 'booking')) as Order['booking']) : undefined;
  } catch {}
  const order: Order = { reference: m.reference, provider: 'stripe', currency, total, lines, customer, ...(booking ? { booking } : {}) };
  const paid = s.payment_status === 'paid' && s.currency.toUpperCase() === currency && s.amount_total === minorUnits(total, currency);
  return { paid, reason: paid ? undefined : s.status === 'expired' ? 'The payment page expired' : s.payment_status, order };
}

export async function verifyStripe(opts: { secret: string; sessionId: string; fetch?: Fetch }): Promise<Verified> {
  const s = await stripe<StripeSession>(opts.fetch ?? fetch, opts.secret, 'GET', `/checkout/sessions/${encodeURIComponent(opts.sessionId)}?expand[]=line_items`);
  return checkStripe(s);
}

/**
 * Stripe signs each webhook with the endpoint's signing secret: the header
 * holds a timestamp and HMAC-SHA256 of "timestamp.body". Old signatures are
 * refused so a captured request can't be replayed.
 */
export function stripeSignatureOk(rawBody: string, header: string | null, signingSecret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = createHmac('sha256', signingSecret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => safeEqual(expected, s));
}

/* ---------- Helpers ---------- */

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A per-order secret derived from a server key, so settling an order needs no stored state. */
export function orderToken(serverKey: string, reference: string): string {
  return createHmac('sha256', serverKey).update(`order:${reference}`).digest('hex');
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Starts a payment with whichever provider the order is for. */
export function startPayment(opts: { secret: string; order: Order; returnUrl: string; cancelUrl: string; fetch?: Fetch }): Promise<string> {
  return opts.order.provider === 'paystack' ? startPaystack(opts) : startStripe(opts);
}
