import { getRepo } from '@/lib/auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The published content of a deployed site, which its server reads at most
 * once a minute. Public, as the site itself is.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ config: null }, { status: 404 });
  const site = await (await getRepo()).publishedSite(id);
  const config = site?.config ?? null;
  return Response.json({ config, version: site?.version ?? null }, { status: config ? 200 : 404, headers: { 'cache-control': 'public, max-age=0, s-maxage=30' } });
}
