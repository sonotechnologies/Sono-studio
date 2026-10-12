import { getRepo } from '@/lib/auth';
import { busyRange } from '@/lib/checkout';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Times already booked on a deployed site (never who booked them), asked for by the site's own server. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = busyRange(req.url);
  if (!UUID.test(id) || !range) return Response.json({ busy: [] }, { status: 400 });
  return Response.json({ busy: await (await getRepo()).siteBusy(id, range.from, range.to) }, { headers: { 'cache-control': 'no-store' } });
}
