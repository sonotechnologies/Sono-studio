import { z } from 'zod';
import { getRepo } from '@/lib/auth';

/*
 * A deployed client site reports each paid order here, with the project's
 * order key (set as SONO_ORDERS_KEY on its hosting when the studio deploys
 * it). The same order reported twice is kept once.
 */

const text = (n: number) => z.string().max(n);
const reportSchema = z.object({
  mode: z.enum(['test', 'live']),
  order: z.object({
    reference: z.string().regex(/^[a-z0-9-]{6,80}$/),
    provider: z.enum(['paystack', 'stripe']),
    currency: z.string().regex(/^[A-Z]{3}$/),
    total: z.number().min(0).max(100_000_000),
    lines: z
      .array(z.object({ productId: text(64), name: text(300), options: z.record(text(24), text(24)), qty: z.number().int().min(1).max(99), price: z.number().min(0).max(100_000_000) }))
      .max(50),
    customer: z.object({ name: text(80), email: text(120), phone: text(32), note: text(400) }),
  }),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!UUID.test(id) || !key) return new Response(null, { status: 401 });
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Not an order' }, { status: 400 });
  const ok = await (await getRepo()).reportSiteOrder(id, key, parsed.data.order, parsed.data.mode).catch((err) => {
    console.error('order report failed', err);
    return null;
  });
  if (ok === null) return new Response(null, { status: 500 });
  return new Response(null, { status: ok ? 204 : 401 });
}
