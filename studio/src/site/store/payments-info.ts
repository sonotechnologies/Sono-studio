import type { Bookings, PaymentProvider, Store } from '../schema';

/* Which card payments a store can take, safe to use in the browser. */

/** Currencies a Paystack business account can charge in. */
export const PAYSTACK_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'];
/** Currencies with no minor unit: Stripe takes 5000 UGX as 5000, not 500000. */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

export function minorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100);
}

export function fromMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency) ? amount : amount / 100;
}

/** Card payments switched on for a store and possible in its currency. */
export function cardProviders(store: Store | undefined): PaymentProvider[] {
  if (!store?.payments) return [];
  const out: PaymentProvider[] = [];
  if (store.payments.paystack && PAYSTACK_CURRENCIES.includes(store.currency)) out.push('paystack');
  if (store.payments.stripe) out.push('stripe');
  return out;
}

export const whatsappOn = (store: Store | undefined) => !store?.payments || store.payments.whatsapp;

/** Card payments switched on for deposits and possible in the bookings currency. */
export function depositProviders(b: Bookings | undefined): PaymentProvider[] {
  if (!b || b.depositPercent <= 0) return [];
  const out: PaymentProvider[] = [];
  if (b.payments.paystack && PAYSTACK_CURRENCIES.includes(b.currency)) out.push('paystack');
  if (b.payments.stripe) out.push('stripe');
  return out;
}

