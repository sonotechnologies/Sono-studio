import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { paymentEnv } = await import('./run');

describe('client payment keys at deploy', () => {
  it('turns the typed keys into environment variables, skipping empty ones', () => {
    expect(paymentEnv({ paystack: ' sk_live_abcdefghij12 ', stripe: '', stripeWebhook: 'whsec_abcdefghij12' })).toEqual({
      PAYSTACK_SECRET_KEY: 'sk_live_abcdefghij12',
      STRIPE_WEBHOOK_SECRET: 'whsec_abcdefghij12',
    });
    expect(paymentEnv(undefined)).toEqual({});
  });

  it('refuses something that isn’t a secret key, such as a public key', () => {
    expect(() => paymentEnv({ paystack: 'pk_live_abcdefghij12' })).toThrow(/Paystack secret key/);
    expect(() => paymentEnv({ stripeWebhook: 'sk_live_abcdefghij12' })).toThrow(/signing secret/);
  });
});
