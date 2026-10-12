import 'server-only';
import { decryptSecret, serverSecret } from '@/lib/crypto';
import type { Repo } from '@/lib/data/repo';
import { siteUrl } from '@/lib/format';
import type { BookingCtx, CheckoutCtx } from '@/site/primitives';
import { siteKey } from '@/site/render';
import { siteConfigSchema, type PaymentProvider, type SiteConfig } from '@/site/schema';
import {
  cardProviders,
  checkPaystack,
  depositProviders,
  newReference,
  priceBooking,
  orderToken,
  PaymentError,
  priceCart,
  sha256,
  startPayment,
  verifyPaystack,
  verifyStripe,
  type Verified,
} from '@/site/store/payments';

/*
 * Test checkouts in the studio: on pitch links (anyone with the link) and in
 * the preview (you). They use your own Paystack or Stripe TEST keys from
 * Settings and record test orders on the project.
 */

export type Scope = { kind: 'pitch'; slug: string } | { kind: 'preview'; projectId: string };

const tokenFor = (reference: string) => orderToken(serverSecret('orders'), reference);

/** Only test keys are ever used here: a live key would take real money on a demo. */
function testOnly(key: string | null): string | null {
  return key && /^sk_test_/.test(key) ? key : null;
}

async function keyFor(repo: Repo, scope: Scope, provider: PaymentProvider | 'stripe_webhook'): Promise<string | null> {
  let sealed: string | null;
  if (scope.kind === 'pitch') sealed = await repo.getPitchPaymentKey(scope.slug, provider);
  else sealed = (await repo.listProviderKeys()).find((k) => k.provider === provider)?.ciphertext ?? null;
  if (!sealed) return null;
  const key = decryptSecret(sealed);
  return provider === 'stripe_webhook' ? (key.startsWith('whsec_') ? key : null) : testOnly(key);
}

async function configFor(repo: Repo, scope: Scope): Promise<SiteConfig | null> {
  const raw = scope.kind === 'pitch' ? (await repo.getPitch(scope.slug))?.config : (await repo.getSiteVersion(scope.projectId))?.config;
  const parsed = raw ? siteConfigSchema.safeParse(raw) : null;
  return parsed?.success ? parsed.data : null;
}

const base = (scope: Scope) => (scope.kind === 'pitch' ? `/p/${scope.slug}` : `/preview/${scope.projectId}`);

/** What the cart offers: the store's card payments that have a test key set. */
export async function checkoutCtx(repo: Repo, scope: Scope, config: SiteConfig): Promise<CheckoutCtx | undefined> {
  const wanted = cardProviders(config.store);
  if (!wanted.length) return undefined;
  const providers: PaymentProvider[] = [];
  for (const p of wanted) if (await keyFor(repo, scope, p).catch(() => null)) providers.push(p);
  const endpoint = scope.kind === 'pitch' ? `/api/pitch/${scope.slug}/checkout` : `/api/projects/${scope.projectId}/checkout`;
  return { endpoint, providers, test: true };
}

/** Prices the cart, records a pending test order and returns the payment page's address. */
export async function startCheckout(repo: Repo, scope: Scope, body: unknown, origin: string = siteUrl()): Promise<string> {
  const config = await configFor(repo, scope);
  if (!config?.store) throw new PaymentError('This shop isn’t available.');
  const priced = priceCart(config.store, body);
  const secret = await keyFor(repo, scope, priced.provider);
  if (!secret) throw new PaymentError('Card payments aren’t set up for this demo yet.');
  const order = { ...priced, reference: newReference(siteKey(config)) };
  const token = tokenFor(order.reference);
  if (scope.kind === 'pitch') await repo.createPitchOrder(scope.slug, order, sha256(token));
  else await repo.createOrder(scope.projectId, order, sha256(token));
  const site = `${origin}${base(scope)}`;
  return startPayment({ secret, order, returnUrl: `${site}/order/${order.reference}`, cancelUrl: `${site}${config.pages.find((p) => p.sections.some((s) => s.type === 'product-grid'))?.path.replace(/^\/$/, '') ?? ''}` });
}

/* ---------- Bookings ---------- */

/** What the booking widget can do here: live free times, and deposits with the providers that have a test key. */
export async function bookingCtx(repo: Repo, scope: Scope, config: SiteConfig): Promise<BookingCtx | undefined> {
  if (!config.bookings) return undefined;
  const providers: PaymentProvider[] = [];
  for (const p of depositProviders(config.bookings)) if (await keyFor(repo, scope, p).catch(() => null)) providers.push(p);
  const api = scope.kind === 'pitch' ? `/api/pitch/${scope.slug}` : `/api/projects/${scope.projectId}`;
  return { busyEndpoint: `${api}/busy`, bookEndpoint: `${api}/book`, providers, test: true };
}

/** Taken times between two moments (at most 15 days apart). */
export function busyFor(repo: Repo, scope: Scope, from: string, to: string) {
  return scope.kind === 'pitch' ? repo.pitchBusy(scope.slug, from, to) : repo.projectBusy(scope.projectId, from, to);
}

/** Checks the time is free, holds it, and returns the deposit's payment page. */
export async function startBooking(repo: Repo, scope: Scope, body: unknown, origin: string = siteUrl()): Promise<string> {
  const config = await configFor(repo, scope);
  const b = config?.bookings;
  if (!config || !b) throw new PaymentError('Booking isn’t available here.');
  const start = Date.parse(String((body as { start?: unknown } | null)?.start ?? ''));
  if (Number.isNaN(start)) throw new PaymentError('Choose a time.');
  const busy = await busyFor(repo, scope, new Date(start - 86_400_000).toISOString(), new Date(start + 2 * 86_400_000).toISOString());
  const { order: priced, slot } = priceBooking(b, body, busy);
  const secret = await keyFor(repo, scope, priced.provider);
  if (!secret) throw new PaymentError('Deposits aren’t set up for this demo yet.');
  const order = { ...priced, reference: newReference(siteKey(config)) };
  const token = tokenFor(order.reference);
  const hold = {
    reference: order.reference, serviceId: priced.booking!.serviceId, serviceName: priced.booking!.serviceName, start: slot.start, end: slot.end,
    capacity: b.capacity, provider: priced.provider, currency: b.currency, deposit: priced.total,
    price: b.services.find((s) => s.id === priced.booking!.serviceId)!.price, customer: priced.customer,
  };
  try {
    if (scope.kind === 'pitch') await repo.createPitchBooking(scope.slug, hold, sha256(token));
    else await repo.createPreviewBooking(scope.projectId, hold, sha256(token));
  } catch (err) {
    if (/time taken/.test((err as Error).message)) throw new PaymentError('Someone has just booked that time. Choose another.');
    throw err;
  }
  const site = `${origin}${base(scope)}`;
  const bookPath = config.pages.find((p) => p.sections.some((s) => s.type === 'booking'))?.path ?? '/';
  return startPayment({ secret, order, returnUrl: `${site}/booking/${order.reference}`, cancelUrl: `${site}${bookPath === '/' ? '' : bookPath}` });
}

/**
 * Checks a payment with the provider when the customer comes back, and marks
 * the order paid or the booking confirmed. Stripe sends a session id back;
 * Paystack the reference.
 */
export async function confirmOrder(repo: Repo, scope: Scope, reference: string, query: { session_id?: string }): Promise<{ verified: Verified | null; error?: string }> {
  try {
    const provider: PaymentProvider = query.session_id ? 'stripe' : 'paystack';
    const secret = await keyFor(repo, scope, provider);
    if (!secret) return { verified: null, error: 'Card payments aren’t set up for this demo.' };
    const verified = provider === 'stripe' ? await verifyStripe({ secret, sessionId: query.session_id! }) : await verifyPaystack({ secret, reference });
    if (verified.order?.reference !== reference) return { verified: null, error: 'This order wasn’t found.' };
    if (verified.paid) await settle(repo, verified);
    return { verified };
  } catch (err) {
    if (err instanceof PaymentError) return { verified: null, error: err.message };
    console.error('order check failed', err);
    return { verified: null, error: 'The payment couldn’t be checked right now.' };
  }
}

/** Marks a verified payment's order paid, or its booking confirmed. */
function settle(repo: Repo, verified: Verified): Promise<boolean> {
  const ref = verified.order!.reference;
  return verified.order!.booking ? repo.settleBooking(ref, tokenFor(ref)) : repo.settleOrder(ref, tokenFor(ref), 'paid');
}

/** Which pitch an order or booking came from. */
async function slugOf(repo: Repo, reference: string): Promise<string | null> {
  return (await repo.orderPitchSlug(reference)) ?? (await repo.bookingPitchSlug(reference));
}

/** A paid order reported by Paystack's webhook (the customer may have closed the tab). */
export async function paystackWebhook(repo: Repo, raw: string, signature: string | null, check: (raw: string, sig: string | null, secret: string) => boolean): Promise<number> {
  let event: { event?: string; data?: Parameters<typeof checkPaystack>[0] };
  try {
    event = JSON.parse(raw);
  } catch {
    return 400;
  }
  const reference = event.data?.reference;
  if (!reference) return 200;
  const slug = await slugOf(repo, reference);
  if (!slug) return 200;
  const secret = await keyFor(repo, { kind: 'pitch', slug }, 'paystack');
  if (!secret || !check(raw, signature, secret)) return 401;
  const verified = event.event === 'charge.success' ? checkPaystack(event.data!) : null;
  if (verified?.paid && verified.order?.reference === reference) await settle(repo, verified);
  return 200;
}

/** A completed Stripe Checkout, from Stripe's webhook. */
export async function stripeWebhook(repo: Repo, raw: string, signature: string | null, check: (raw: string, header: string | null, secret: string) => boolean): Promise<number> {
  let event: { type?: string; data?: { object?: { id?: string; client_reference_id?: string | null } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return 400;
  }
  const session = event.data?.object;
  const reference = session?.client_reference_id;
  if (!reference || !session?.id) return 200;
  const slug = await slugOf(repo, reference);
  if (!slug) return 200;
  const scope: Scope = { kind: 'pitch', slug };
  const signing = await keyFor(repo, scope, 'stripe_webhook');
  if (!signing || !check(raw, signature, signing)) return 401;
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return 200;
  const secret = await keyFor(repo, scope, 'stripe');
  if (!secret) return 200;
  // The event is only a nudge: the session is read back from Stripe before the order counts as paid.
  const verified = await verifyStripe({ secret, sessionId: session.id });
  if (verified.paid && verified.order?.reference === reference) await settle(repo, verified);
  return 200;
}

export { PaymentError };

/** Reads ?from=&to= (ISO, at most 15 days apart) for a busy-times request. */
export function busyRange(url: string): { from: string; to: string } | null {
  const q = new URL(url).searchParams;
  const from = Date.parse(q.get('from') ?? '');
  const to = Date.parse(q.get('to') ?? '');
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from || to - from > 15 * 86_400_000) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
