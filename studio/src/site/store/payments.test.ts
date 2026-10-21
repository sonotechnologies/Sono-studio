import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { VOLT_SUPPLY } from '../samples/volt-supply';
import type { Store } from '../schema';
import {
  cardProviders,
  checkPaystack,
  minorUnits,
  newReference,
  orderFitsStore,
  paystackSignatureOk,
  priceCart,
  startPaystack,
  startStripe,
  stripeSignatureOk,
  verifyStripe,
  type Order,
} from './payments';

const store: Store = { ...VOLT_SUPPLY.store!, payments: { whatsapp: true, paystack: true, stripe: true } };
const customer = { name: 'Ama', email: 'ama@example.com', phone: '', note: 'Gate 2' };
const earbuds = store.products.find((p) => p.options?.length && !p.soldOut)!;

function capture(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reply), { status });
  }) as typeof fetch;
  return { f, calls };
}

describe('pricing a cart on the server', () => {
  it('uses the product list’s prices and options, never the browser’s', () => {
    const r = priceCart(store, {
      provider: 'paystack',
      lines: [{ productId: earbuds.id, qty: 2, options: { [earbuds.options![0].name]: 'Not a real choice' }, price: 1 }],
      customer,
    });
    expect(r.total).toBe(earbuds.price * 2);
    expect(r.lines[0].options[earbuds.options![0].name]).toBe(earbuds.options![0].values[0]);
  });

  it('refuses sold-out, unknown and unpriced products, bad quantities and missing details', () => {
    const soldOut = store.products.find((p) => p.soldOut)!;
    const bad = (body: unknown) => () => priceCart(store, body);
    expect(bad({ provider: 'paystack', lines: [{ productId: soldOut.id, qty: 1 }], customer })).toThrow(/sold out/);
    expect(bad({ provider: 'paystack', lines: [{ productId: 'nope', qty: 1 }], customer })).toThrow(/no longer sold/);
    expect(bad({ provider: 'paystack', lines: [{ productId: earbuds.id, qty: 0 }], customer })).toThrow(/quantities/);
    expect(bad({ provider: 'paystack', lines: [{ productId: earbuds.id, qty: 1 }], customer: { ...customer, email: 'x' } })).toThrow(/email/);
    expect(bad({ provider: 'paypal', lines: [{ productId: earbuds.id, qty: 1 }], customer })).toThrow(/way to pay/);
    expect(() => priceCart({ ...store, payments: { whatsapp: true, paystack: false, stripe: true } }, { provider: 'paystack', lines: [{ productId: earbuds.id, qty: 1 }], customer })).toThrow(/isn’t available/);
  });

  it('offers Paystack only in the currencies it charges in', () => {
    expect(cardProviders(store)).toEqual(['paystack', 'stripe']);
    expect(cardProviders({ ...store, currency: 'EUR' })).toEqual(['stripe']);
    expect(cardProviders({ ...store, payments: undefined })).toEqual([]);
    expect(minorUnits(12.5, 'GHS')).toBe(1250);
    expect(minorUnits(5000, 'UGX')).toBe(5000);
  });
});

const order: Order = {
  reference: newReference('volt'),
  provider: 'paystack',
  currency: 'NGN',
  total: 90000,
  lines: [{ productId: 'x2', name: 'X2 Earbuds', options: { Colour: 'Black' }, qty: 2, price: 45000 }],
  customer,
};

describe('Paystack', () => {
  it('starts a payment in kobo with the order attached', async () => {
    const { f, calls } = capture({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } });
    const url = await startPaystack({ secret: 'sk_test_x', order, returnUrl: 'https://s/order/r', cancelUrl: 'https://s/shop', fetch: f });
    expect(url).toBe('https://checkout.paystack.com/abc');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ amount: 9000000, currency: 'NGN', reference: order.reference, email: customer.email, metadata: { order } });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer sk_test_x');
  });

  it('counts an order as paid only when status, currency and amount all match', () => {
    const tx = { status: 'success', reference: order.reference, amount: 9000000, currency: 'NGN', metadata: { order } };
    expect(checkPaystack(tx).paid).toBe(true);
    expect(checkPaystack({ ...tx, amount: 100 }).paid).toBe(false);
    expect(checkPaystack({ ...tx, status: 'abandoned' }).paid).toBe(false);
    expect(checkPaystack({ ...tx, reference: 'someone-else' }).order).toBeNull();
    expect(checkPaystack({ ...tx, metadata: JSON.stringify({ order }) }).paid).toBe(true);
  });

  it('checks webhook signatures', () => {
    const body = '{"event":"charge.success"}';
    const sig = createHmac('sha512', 'sk_test_x').update(body).digest('hex');
    expect(paystackSignatureOk(body, sig, 'sk_test_x')).toBe(true);
    expect(paystackSignatureOk(body, sig, 'sk_test_y')).toBe(false);
    expect(paystackSignatureOk(`${body} `, sig, 'sk_test_x')).toBe(false);
    expect(paystackSignatureOk(body, null, 'sk_test_x')).toBe(false);
  });
});

describe('Stripe', () => {
  const stripeOrder = { ...order, provider: 'stripe' as const, currency: 'USD', total: 25.5, lines: [{ productId: 'tee', name: 'Tee', options: { Size: 'M' }, qty: 1, price: 25.5 }] };

  it('creates a Checkout session in cents', async () => {
    const { f, calls } = capture({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    expect(await startStripe({ secret: 'sk_test_s', order: stripeOrder, returnUrl: 'https://s/order/r', cancelUrl: 'https://s/shop', fetch: f })).toBe('https://checkout.stripe.com/c/cs_1');
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('2550');
    expect(body.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(body.get('line_items[0][price_data][product_data][name]')).toBe('Tee (Size: M)');
    expect(body.get('success_url')).toBe('https://s/order/r?session_id={CHECKOUT_SESSION_ID}');
    expect(body.get('metadata[reference]')).toBe(order.reference);
  });

  it('reads a paid session back into the order', async () => {
    const session = {
      id: 'cs_1',
      payment_status: 'paid',
      status: 'complete',
      amount_total: 2550,
      currency: 'usd',
      client_reference_id: order.reference,
      metadata: { reference: order.reference, total: '25.5', currency: 'USD', customer: JSON.stringify(customer), lines: JSON.stringify([['tee', 1, 25.5, { Size: 'M' }]]) },
      line_items: { data: [{ description: 'Tee (Size: M)', quantity: 1, amount_total: 2550 }] },
    };
    const { f, calls } = capture(session);
    const v = await verifyStripe({ secret: 'sk_test_s', sessionId: 'cs_1', fetch: f });
    expect(calls[0].url).toContain('/checkout/sessions/cs_1?expand[]=line_items');
    expect(v.paid).toBe(true);
    expect(v.order).toMatchObject({ reference: order.reference, total: 25.5, currency: 'USD', customer, lines: [{ productId: 'tee', name: 'Tee', qty: 1, price: 25.5, options: { Size: 'M' } }] });
    const unpaid = await verifyStripe({ secret: 'sk_test_s', sessionId: 'cs_1', fetch: capture({ ...session, payment_status: 'unpaid' }).f });
    expect(unpaid.paid).toBe(false);
  });

  it('checks webhook signatures and refuses old ones', () => {
    const body = '{"type":"checkout.session.completed"}';
    const now = 1_760_000_000_000;
    const t = Math.floor(now / 1000);
    const sig = createHmac('sha256', 'whsec_abc').update(`${t}.${body}`).digest('hex');
    expect(stripeSignatureOk(body, `t=${t},v1=${sig}`, 'whsec_abc', now)).toBe(true);
    expect(stripeSignatureOk(body, `t=${t},v1=${sig}`, 'whsec_other', now)).toBe(false);
    expect(stripeSignatureOk(body, `t=${t},v1=${sig}`, 'whsec_abc', now + 600_000)).toBe(false);
  });

  it('explains a rejected key', async () => {
    await expect(startStripe({ secret: 'bad', order: stripeOrder, returnUrl: 'x', cancelUrl: 'y', fetch: capture({ error: { message: 'Invalid API Key' } }, 401).f })).rejects.toThrow(/key was rejected/);
  });
});

describe('long orders, odd prices and forged payments', () => {
  it('sends long customer details and many lines to Stripe in pieces and reads them back whole', async () => {
    const long = { name: 'Adaeze Okonkwo-Williams', email: 'adaeze.okonkwo.williams@example.com', phone: '+234 803 000 0000', note: 'Leave it with the gateman. '.repeat(15).trim() };
    const lines = Array.from({ length: 10 }, (_, i) => ({ productId: `product-${i}`, name: `Item ${i}`, options: { Size: 'Large', Colour: 'Midnight blue' }, qty: 1, price: 10 }));
    const big = { ...order, provider: 'stripe' as const, currency: 'USD', total: 100, customer: long, lines };
    const { f, calls } = capture({ id: 'cs_2', url: 'https://checkout.stripe.com/c/cs_2' });
    await startStripe({ secret: 'sk_test_s', order: big, returnUrl: 'https://s/order/r', cancelUrl: 'https://s', fetch: f });
    const body = new URLSearchParams(String(calls[0].init.body));
    const metadata = Object.fromEntries([...body.entries()].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]));
    expect(Object.values(metadata).every((v) => v.length <= 500)).toBe(true);
    const session = {
      id: 'cs_2', payment_status: 'paid', status: 'complete', amount_total: 10000, currency: 'usd', client_reference_id: order.reference, metadata,
      line_items: { data: lines.map((l) => ({ description: `${l.name} (Size: Large, Colour: Midnight blue)`, quantity: 1, amount_total: 1000 })) },
    };
    const v = await verifyStripe({ secret: 'sk_test_s', sessionId: 'cs_2', fetch: capture(session).f });
    expect(v.order?.customer).toEqual(long);
    expect(v.order?.lines.map((l) => l.productId)).toEqual(lines.map((l) => l.productId));
  });

  it('prices in the currency’s smallest unit, so the total is what the provider charges', () => {
    const odd: Store = { ...store, currency: 'USD', products: store.products.map((p) => (p.id === earbuds.id ? { ...p, price: 0.335 } : p)) };
    const r = priceCart(odd, { provider: 'stripe', lines: [{ productId: earbuds.id, qty: 3 }], customer });
    expect(r.lines[0].price).toBe(0.34);
    expect(minorUnits(r.total, 'USD')).toBe(minorUnits(r.lines[0].price, 'USD') * 3);
  });

  it('only counts a paid order whose lines cost what was paid', () => {
    const real = { ...priceCart(store, { provider: 'paystack', lines: [{ productId: earbuds.id, qty: 2 }], customer }), reference: 'volt-x1' };
    expect(orderFitsStore(store, real)).toBe(true);
    expect(orderFitsStore(store, { ...real, total: 1 })).toBe(false);
    expect(orderFitsStore(store, { ...real, lines: [{ ...real.lines[0], productId: 'not-sold-here' }] })).toBe(false);
    // Sold out since it was paid for: still a real order.
    expect(orderFitsStore({ ...store, products: store.products.map((p) => ({ ...p, soldOut: true })) }, real)).toBe(true);
  });
});
