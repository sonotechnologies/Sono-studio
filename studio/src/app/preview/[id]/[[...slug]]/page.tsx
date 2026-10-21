import { ChevronLeft, Download, Monitor, Smartphone, Tablet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Logo } from '@/components/logo';
import { getRepo, requireUser } from '@/lib/auth';
import { bookingCtx, checkoutCtx, confirmOrder } from '@/lib/checkout';
import { SiteFonts } from '@/components/site-fonts';
import { findPage, orderPage, siteKey, SitePageView } from '@/site/render';
import { OrderView } from '@/site/store/order-view';
import { BookingView } from '@/site/store/booking-view';
import { siteConfigSchema } from '@/site/schema';

type Props = {
  params: Promise<{ id: string; slug?: string[] }>;
  searchParams: Promise<{ w?: string; session_id?: string }>;
};

const WIDTHS = {
  desktop: { label: 'Desktop', Icon: Monitor, max: undefined },
  tablet: { label: 'Tablet', Icon: Tablet, max: 820 },
  phone: { label: 'Phone', Icon: Smartphone, max: 390 },
} as const;
type Width = keyof typeof WIDTHS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One read per request, shared by the metadata and the page. */
const load = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const repo = await getRepo();
  const [project, version] = await Promise.all([repo.getProject(id), repo.getSiteVersion(id)]);
  return project ? { project, version } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).id);
  return { title: data ? `Preview · ${data.project.name}` : 'Preview' };
}

export default async function PreviewPage({ params, searchParams }: Props) {
  await requireUser();
  const { id, slug } = await params;
  const query = await searchParams;
  const { w } = query;
  const data = await load(id);
  if (!data) notFound();
  const { project, version } = data;
  const width: Width = w && w in WIDTHS ? (w as Width) : 'desktop';
  const qs = width === 'desktop' ? '' : `?w=${width}`;
  const base = `/preview/${id}`;
  const path = `/${(slug ?? []).join('/')}`;

  if (!version) {
    return (
      <Message title="No site yet" back={`/projects/${id}`}>
        Create a starter site from the project page first.
      </Message>
    );
  }
  const parsed = siteConfigSchema.safeParse(version.config);
  if (!parsed.success) {
    return (
      <Message title={`Version ${version.version} doesn’t pass validation`} back={`/projects/${id}`}>
        {parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}
      </Message>
    );
  }
  const config = parsed.data;
  // Back from a test payment: the order page, checked with the provider.
  const orderRef = slug?.[0] === 'order' && slug.length === 2 && /^[a-z0-9-]{6,80}$/.test(slug[1]) ? slug[1] : null;
  const bookingRef = slug?.[0] === 'booking' && slug.length === 2 && /^[a-z0-9-]{6,80}$/.test(slug[1]) ? slug[1] : null;
  const page = (orderRef && config.store) || (bookingRef && config.bookings) ? orderPage(config) : findPage(config, path);
  if (!page) notFound();
  const repo = await getRepo();
  const scope = { kind: 'preview' as const, projectId: id };
  const [checkout, booking] = await Promise.all([config.store ? checkoutCtx(repo, scope, config) : undefined, bookingCtx(repo, scope, config)]);
  const result = orderRef && config.store ? await confirmOrder(repo, scope, orderRef, query) : null;
  const bookingResult = bookingRef && config.bookings ? await confirmOrder(repo, scope, bookingRef, query) : null;

  /** Site paths ("/menu", "/#offer") become preview URLs that keep the chosen width. */
  const link = (href: string) => {
    const [p, hash] = href.split('#');
    return `${base}${p === '/' ? '' : p}${qs}${hash ? `#${hash}` : ''}`;
  };

  return (
    <div className="min-h-dvh bg-stage">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg px-3 md:px-5">
        <Link
          href={`/projects/${id}`}
          className="flex h-10 items-center gap-1.5 rounded-full pr-3 pl-2 text-[14px] font-medium text-muted hover:bg-hover hover:text-text"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          <Logo kind="mark" alt="" className="h-3.5 w-auto" />
          <span className="hidden sm:inline">{project.name}</span>
        </Link>
        <nav aria-label="Pages" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {config.pages.map((p) => {
            const on = p.path === page.path;
            return (
              <Link
                key={p.id}
                href={link(p.path)}
                aria-current={on ? 'page' : undefined}
                className={`flex h-9 items-center rounded-full px-3 text-[13px] font-medium whitespace-nowrap ${
                  on ? 'bg-sel text-text' : 'text-muted hover:bg-hover hover:text-text'
                }`}
              >
                {p.title}
              </Link>
            );
          })}
        </nav>
        <span className="hidden font-mono text-[12px] text-muted md:inline">v{version.version}</span>
        <a
          href={`/api/projects/${id}/site-data`}
          download
          title="Download site data (JSON): the copy, plan and models used"
          aria-label="Download site data"
          className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text"
        >
          <Download size={16} strokeWidth={2} />
        </a>
        <Link href={`/workspace/${id}`} className="hidden h-9 items-center rounded-full border border-border px-3 text-[13px] font-medium hover:bg-hover sm:flex">
          Edit
        </Link>
        <div role="group" aria-label="Preview width" className="flex rounded-full bg-sel p-[3px]">
          {(Object.keys(WIDTHS) as Width[]).map((k) => {
            const { label, Icon } = WIDTHS[k];
            const on = k === width;
            return (
              <Link
                key={k}
                href={`${base}${path === '/' ? '' : path}${k === 'desktop' ? '' : `?w=${k}`}`}
                aria-label={label}
                aria-current={on ? 'true' : undefined}
                title={label}
                className={`flex size-8 items-center justify-center rounded-full ${
                  on ? 'bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,.12)]' : 'text-muted hover:text-text'
                }`}
              >
                <Icon size={16} strokeWidth={2} />
              </Link>
            );
          })}
        </div>
      </header>
      <main className={width === 'desktop' ? '' : 'px-3 py-6'}>
        <div
          style={{ maxWidth: WIDTHS[width].max }}
          className={`mx-auto ${width === 'desktop' ? '' : 'overflow-clip rounded-[18px] shadow-[0_20px_60px_rgba(22,20,15,.25)]'}`}
        >
          <SiteFonts fonts={[config.theme.fonts.heading, config.theme.fonts.body]} />
          <SitePageView
            config={config}
            page={page}
            ctx={{ link, editable: false, checkout, booking }}
            insert={
              result && orderRef ? (
                <OrderView config={config} reference={orderRef} verified={result.verified} error={result.error} ctx={{ link, editable: false }} siteKey={siteKey(config)} test />
              ) : bookingResult && bookingRef ? (
                <BookingView config={config} reference={bookingRef} verified={bookingResult.verified} error={bookingResult.error} ctx={{ link, editable: false }} test />
              ) : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}

function Message({ title, back, children }: { title: string; back: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
      <Logo kind="mark" alt="Sono" className="h-10 w-auto" />
      <h1 className="m-0 text-[20px] font-semibold">{title}</h1>
      <p className="m-0 max-w-[560px] text-[14px] text-muted">{children}</p>
      <Link href={back} className="text-[14px] font-medium text-accent-text hover:underline">
        Back to the project
      </Link>
    </main>
  );
}
