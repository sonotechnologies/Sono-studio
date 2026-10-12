import 'server-only';
import { decryptSecret, serverSecret } from '@/lib/crypto';
import type { Repo } from '@/lib/data/repo';
import { siteUrl } from '@/lib/format';
import type { CheckoutCtx } from '@/site/primitives';
import { siteKey } from '@/site/render';
import { siteConfigSchema, type PaymentProvider, type SiteConfig } from '@/site/schema';
import {
  cardProviders,
  checkPaystack,
  newReference,
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

/**
 * Checks an order with the provider when the customer comes back to the order
 * page, and marks it paid. Stripe sends a session id back; Paystack the reference.
 */
export async function confirmOrder(repo: Repo, scope: Scope, reference: string, query: { session_id?: string }): Promise<{ verified: Verified | null; error?: string }> {
  try {
    const provider: PaymentProvider = query.session_id ? 'stripe' : 'paystack';
    const secret = await keyFor(repo, scope, provider);
    if (!secret) return { verified: null, error: 'Card payments aren’t set up for this demo.' };
    const verified = provider === 'stripe' ? await verifyStripe({ secret, sessionId: query.session_id! }) : await verifyPaystack({ secret, reference });
    if (verified.order?.reference !== reference) return { verified: null, error: 'This order wasn’t found.' };
    if (verified.paid) await repo.settleOrder(reference, tokenFor(reference), 'paid');
    return { verified };
  } catch (err) {
    if (err instanceof PaymentError) return { verified: null, error: err.message };
    console.error('order check failed', err);
    return { verified: null, error: 'The payment couldn’t be checked right now.' };
  }
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
  const slug = await repo.orderPitchSlug(reference);
  if (!slug) return 200;
  const secret = await keyFor(repo, { kind: 'pitch', slug }, 'paystack');
  if (!secret || !check(raw, signature, secret)) return 401;
  if (event.event === 'charge.success' && checkPaystack(event.data!).paid) await repo.settleOrder(reference, tokenFor(reference), 'paid');
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
  const slug = await repo.orderPitchSlug(reference);
  if (!slug) return 200;
  const scope: Scope = { kind: 'pitch', slug };
  const signing = await keyFor(repo, scope, 'stripe_webhook');
  if (!signing || !check(raw, signature, signing)) return 401;
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return 200;
  const secret = await keyFor(repo, scope, 'stripe');
  if (!secret) return 200;
  // The event is only a nudge: the session is read back from Stripe before the order counts as paid.
  const verified = await verifyStripe({ secret, sessionId: session.id });
  if (verified.paid && verified.order?.reference === reference) await repo.settleOrder(reference, tokenFor(reference), 'paid');
  return 200;
}

export { PaymentError };
