import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { getRepo, requireUser } from '@/lib/auth';
import { SiteFonts } from '@/components/site-fonts';
import { findPage, SitePageView } from '@/site/render';
import { siteConfigSchema } from '@/site/schema';

export const metadata: Metadata = { title: 'Thumbnail' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A site's home page as it is, for the small live previews on project cards.
 * The cards load it in a frame with scripts off, scaled down. A version's
 * content never changes, so it's read from the database once and kept in the
 * hosting's cache (per person), rather than on every view of the dashboard.
 */
export default async function ThumbPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const v = Number((await searchParams).v);
  if (!UUID.test(id) || !Number.isInteger(v) || v < 1) notFound();
  const repo = await getRepo();
  const config = await unstable_cache(async () => (await repo.getSiteVersionNumber(id, v))?.config ?? null, ['thumb-config', user.email, id, String(v)], { revalidate: 30 * 86_400 })();
  const parsed = config ? siteConfigSchema.safeParse(config) : null;
  if (!parsed?.success) notFound();
  const page = findPage(parsed.data, '/') ?? parsed.data.pages[0];
  if (!page) notFound();
  return (
    <>
      <SiteFonts fonts={[parsed.data.theme.fonts.heading, parsed.data.theme.fonts.body]} />
      <SitePageView config={parsed.data} page={page} ctx={{ link: () => '#', editable: false }} />
    </>
  );
}
