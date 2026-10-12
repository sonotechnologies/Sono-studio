import { getRepo } from '@/lib/auth';
import { paystackWebhook } from '@/lib/checkout';
import { paystackSignatureOk } from '@/site/store/payments';

/** Paystack's webhook for test payments on pitch links: set this address in Paystack → Settings → API Keys & Webhooks (test mode). */
export async function POST(req: Request) {
  const raw = await req.text();
  const status = await paystackWebhook(await getRepo(), raw, req.headers.get('x-paystack-signature'), paystackSignatureOk).catch((err) => {
    console.error('paystack webhook failed', err);
    return 500;
  });
  return new Response(null, { status });
}
