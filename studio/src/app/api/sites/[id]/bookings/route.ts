import { z } from 'zod';
import { getRepo } from '@/lib/auth';

/*
 * A deployed site's bookings, proven with the project's order key (set on its
 * hosting when the studio deploys it): hold a time while the deposit is paid,
 * then confirm it once the payment is checked.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (n: number) => z.string().max(n);
const ref = z.string().regex(/^[a-z0-9-]{6,80}$/);

const holdSchema = z.object({
  action: z.literal('hold'),
  mode: z.enum(['test', 'live']),
  hold: z.object({
    reference: ref,
    serviceId: text(64),
    serviceName: text(80),
    start: z.string().datetime(),
    end: z.string().datetime(),
    capacity: z.number().int().min(1).max(20),
    provider: z.enum(['paystack', 'stripe']).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    deposit: z.number().min(0).max(100_000_000),
    price: z.number().min(0).max(100_000_000),
    customer: z.object({ name: text(80), email: text(120), phone: text(32), note: text(400) }),
  }),
});
const confirmSchema = z.object({ action: z.literal('confirm'), reference: ref });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!UUID.test(id) || !key) return new Response(null, { status: 401 });
  const body = await req.json().catch(() => null);
  const repo = await getRepo();
  try {
    const hold = holdSchema.safeParse(body);
    if (hold.success) {
      const ok = await repo.holdSiteBooking(id, key, hold.data.hold, hold.data.mode);
      return ok ? new Response(null, { status: 204 }) : new Response(null, { status: 401 });
    }
    const confirm = confirmSchema.safeParse(body);
    if (confirm.success) return new Response(null, { status: (await repo.confirmSiteBooking(id, key, confirm.data.reference)) ? 204 : 401 });
    return Response.json({ error: 'Not a booking' }, { status: 400 });
  } catch (err) {
    if (/time taken/.test((err as Error).message)) return Response.json({ error: 'time taken' }, { status: 409 });
    console.error('site booking failed', err);
    return new Response(null, { status: 500 });
  }
}
