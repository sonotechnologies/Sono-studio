import { getRepo } from '@/lib/auth';
import { stripeWebhook } from '@/lib/checkout';
import { stripeSignatureOk } from '@/site/store/payments';

/** Stripe's webhook for test payments on pitch links (event: checkout.session.completed). */
export async function POST(req: Request) {
  const raw = await req.text();
  const status = await stripeWebhook(await getRepo(), raw, req.headers.get('stripe-signature'), (r, h, s) => stripeSignatureOk(r, h, s)).catch((err) => {
    console.error('stripe webhook failed', err);
    return 500;
  });
  return new Response(null, { status });
}
