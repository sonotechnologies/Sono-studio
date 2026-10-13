'use client';

import { CalendarDays, ExternalLink, FileText, LogOut, Package, Receipt, Scissors } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { btn, useToast } from '@/components/ui';
import { MiniSpin } from '@/components/orbit';
import type { Asset } from '@/generate/brief';
import type { BookingRecord, OrderRecord } from '@/lib/data/repo';
import { SECTIONS } from '@/site/registry';
import type { SiteConfig, SiteImage } from '@/site/schema';
import { contentSchemaFor } from '@/generate/fill';
import { findSection, getIn, setField, setIn, syncShared } from '@/workspace/model';
import { saveProduct } from '@/workspace/store';
import { BookingsCard } from '../(app)/projects/[id]/bookings-card';
import { OrdersCard } from '../(app)/projects/[id]/orders-card';
import { BookingsPanel } from '../workspace/bookings-panel';
import { MediaDialog } from '../workspace/dialogs';
import { FieldFor, type FieldCtx } from '../workspace/fields';
import { ProductsPanel } from '../workspace/products-panel';
import { Stage } from '../workspace/stage';
import { adminSaveAction, adminSetBookingStatusAction, adminSetOrderStatusAction, adminSignOutAction } from './actions';

/*
 * The client's admin panel: the site's words and photos (edited on the page
 * itself, as in the studio), products, services and hours, and their orders
 * and bookings. Changes are kept here until Publish, which puts them live.
 */

type Tab = 'pages' | 'products' | 'services' | 'orders' | 'bookings';

export function AdminApp({
  me,
  siteUrl,
  initialConfig,
  version: initialVersion,
  orders,
  bookings,
  initialAssets,
  now,
}: {
  me: { name: string; email: string; projectId: string; projectName: string };
  siteUrl: string;
  initialConfig: SiteConfig;
  version: number;
  orders: OrderRecord[] | null;
  bookings: BookingRecord[] | null;
  initialAssets: Asset[];
  now: number;
}) {
  const toast = useToast();
  const [config, setConfig] = useState(initialConfig);
  const [version, setVersion] = useState(initialVersion);
  const [changes, setChanges] = useState<string[]>([]);
  const [saving, startSave] = useTransition();
  const [tab, setTab] = useState<Tab>('pages');
  const [pageId, setPageId] = useState(initialConfig.pages.find((p) => p.path === '/')?.id ?? initialConfig.pages[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null);
  const [media, setMedia] = useState<{ sectionId?: string; productId?: string; path: string } | null>(null);
  const [assets, setAssets] = useState(initialAssets);
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const published = useRef(initialConfig);
  const configRef = useRef(config);
  configRef.current = config;

  const page = config.pages.find((p) => p.id === pageId) ?? config.pages[0];
  const selected = selectedId ? (findSection(config, selectedId)?.section ?? null) : null;
  const dirty = changes.length > 0;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (next: SiteConfig, what: string) => {
    setConfig(next);
    setChanges((c) => (c.includes(what) ? c : [...c, what]));
  };
  const tryChange = (fn: () => SiteConfig, what: string) => {
    try {
      change(fn(), what);
    } catch (err) {
      toast(`Not changed: ${(err as Error).message}`);
    }
  };
  const editField = (sectionId: string, path: string, value: unknown) =>
    tryChange(() => syncShared(setField(configRef.current, sectionId, path, value), sectionId), findSection(configRef.current, sectionId) ? SECTIONS[findSection(configRef.current, sectionId)!.section.type].label : 'Text');

  const publish = () =>
    startSave(async () => {
      const r: { version?: number; error?: string } = await adminSaveAction(version, configRef.current, changes.slice(0, 5).join(', ')).catch(() => ({
        error: 'Couldn’t reach the server. Your changes are still here; try again.',
      }));
      if (r.error || !r.version) return toast(r.error ?? 'Not published. Try again.');
      setVersion(r.version);
      published.current = configRef.current;
      setChanges([]);
      toast('Published. Your website shows the changes within a minute.', { label: 'View site', href: siteUrl });
    });

  const fieldCtx: FieldCtx = {
    set: (path, value) => selectedId && editField(selectedId, path, value),
    pickImage: (path) => selectedId && setMedia({ sectionId: selectedId, path }),
    pages: config.pages.map((p) => ({ path: p.path, title: p.title })),
    focusPath: focus?.path ?? null,
    products: config.store?.products.map((p) => ({ id: p.id, name: p.name })),
    categories: config.store ? [...new Set(config.store.products.map((p) => p.category).filter(Boolean))] : undefined,
  };

  const mediaCurrent = (() => {
    if (!media) return null;
    if (media.sectionId) {
      const s = findSection(config, media.sectionId)?.section;
      return s ? ((getIn(s.content, media.path) as SiteImage | undefined) ?? null) : null;
    }
    const p = config.store?.products.find((x) => x.id === media.productId);
    return p ? ((getIn(p, media.path) as SiteImage | undefined) ?? null) : null;
  })();

  const pick = (image: SiteImage) => {
    const m = media!;
    setMedia(null);
    const img = { ...image, alt: image.alt || mediaCurrent?.alt || '' };
    if (m.sectionId) return editField(m.sectionId, m.path, img);
    const p = configRef.current.store?.products.find((x) => x.id === m.productId);
    if (!p) return;
    const next = m.path === 'image' ? { ...p, image: img } : setIn({ ...p, images: [...(p.images ?? [])] }, m.path, img);
    tryChange(() => saveProduct(configRef.current, { ...next, sample: undefined }), p.name);
  };

  const tabs: { id: Tab; label: string; Icon: typeof FileText; show: boolean }[] = [
    { id: 'pages', label: 'Pages', Icon: FileText, show: true },
    { id: 'products', label: 'Products', Icon: Package, show: !!config.store },
    { id: 'services', label: 'Services and hours', Icon: Scissors, show: !!config.bookings },
    { id: 'orders', label: 'Orders', Icon: Receipt, show: !!orders },
    { id: 'bookings', label: 'Bookings', Icon: CalendarDays, show: !!bookings },
  ];

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-semibold">{me.projectName}</span>
          <span className="truncate text-[12px] text-muted">Signed in as {me.name || me.email}</span>
        </div>
        <a href={siteUrl} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium hover:bg-hover">
          View site
          <ExternalLink size={14} />
        </a>
        <form action={adminSignOutAction}>
          <button type="submit" className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-text">
            <LogOut size={15} />
            Sign out
          </button>
        </form>
      </header>

      <nav aria-label="Admin" className="flex flex-none gap-1 overflow-x-auto border-b border-border bg-surface px-3 md:px-5">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`flex h-11 flex-none cursor-pointer items-center gap-1.5 px-2.5 text-[14px] font-medium whitespace-nowrap ${tab === t.id ? 'text-accent-text shadow-[inset_0_-2px_0_#B4502E]' : 'text-muted hover:text-text'}`}
            >
              <t.Icon size={15} />
              {t.label}
            </button>
          ))}
      </nav>

      {dirty && (
        <div role="status" className="flex flex-none flex-wrap items-center gap-3 bg-warn-bg px-4 py-2 text-[13px] text-warn md:px-6">
          <span className="flex-1">Not published yet: {changes.slice(0, 4).join(', ')}{changes.length > 4 ? ` and ${changes.length - 4} more` : ''}.</span>
          <button
            type="button"
            onClick={() => {
              setConfig(published.current);
              setChanges([]);
              setSelectedId(null);
            }}
            disabled={saving}
            className="cursor-pointer font-medium hover:underline disabled:hidden"
          >
            Discard
          </button>
          <button type="button" onClick={publish} disabled={saving} className={`${btn.primary} h-9 px-4 text-[13px]`}>
            {saving ? <MiniSpin /> : null}
            {saving ? 'Publishing…' : 'Publish changes'}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {tab === 'pages' && (
          <div className="flex h-full flex-col md:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex flex-none items-center gap-2 overflow-x-auto px-4 py-2 md:px-6">
                {config.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPageId(p.id);
                      setSelectedId(null);
                    }}
                    className={`h-8 flex-none cursor-pointer rounded-full px-3 text-[13px] font-medium ${p.id === page.id ? 'bg-text text-bg' : 'border border-border hover:bg-hover'}`}
                  >
                    {p.title}
                  </button>
                ))}
                <span className="ml-2 flex-none text-[12px] text-muted max-md:hidden">Click any text or photo on the page to change it.</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-stage">
                <Stage
                  config={config}
                  page={page}
                  device="desktop"
                  selectedId={selectedId}
                  hoverId={hoverId}
                  flashIds={[]}
                  scrollKey={0}
                  onHover={setHoverId}
                  onSelect={(id) => {
                    if (id !== selectedId) setFocus(null);
                    setSelectedId(id);
                  }}
                  onEditText={editField}
                  onFocusField={(id, path) => {
                    setSelectedId(id);
                    setFocus((f) => ({ path, n: (f?.n ?? 0) + 1 }));
                  }}
                  onPickImage={(id, path) => setMedia({ sectionId: id, path })}
                  onProduct={(id) => {
                    setOpenProduct(id);
                    setTab('products');
                  }}
                />
              </div>
            </div>
            <aside aria-label="Edit" className="flex max-h-[45dvh] min-h-0 flex-none flex-col border-t border-border bg-surface md:max-h-none md:w-[360px] md:border-t-0 md:border-l">
              {selected ? (
                <div key={`${selected.id}-${focus?.n ?? 0}`} className="flex flex-col gap-4 overflow-auto p-5">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-[18px] font-semibold">{SECTIONS[selected.type].label}</span>
                    <button type="button" onClick={() => setSelectedId(null)} className="cursor-pointer text-[13px] text-muted hover:text-text">
                      Done
                    </button>
                  </div>
                  <FieldFor name="content" schema={contentSchemaFor(selected.type)} value={selected.content} path="" ctx={fieldCtx} hideLabel />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-[14px] leading-normal text-muted">
                  Click a part of the page to change its words or photos. Nothing goes live until you press Publish changes.
                </div>
              )}
            </aside>
          </div>
        )}

        {tab === 'products' && config.store && (
          <div className="mx-auto flex h-full max-w-[640px] flex-col overflow-auto">
            <ProductsPanel
              config={config}
              openId={openProduct}
              onOpen={setOpenProduct}
              onChange={(next, summary) => tryChange(() => next, summary)}
              onPickImage={(productId, path) => setMedia({ productId, path })}
              onAddShop={() => {}}
              onPreview={(id) => window.open(`${siteUrl.replace(/\/+$/, '')}/product/${id}`, '_blank')}
              testKeys={{ paystack: false, stripe: false }}
              limited
            />
          </div>
        )}

        {tab === 'services' && config.bookings && (
          <div className="mx-auto flex h-full max-w-[640px] flex-col overflow-auto">
            <BookingsPanel config={config} onChange={(next, summary) => tryChange(() => next, summary)} onAdd={() => {}} testKeys={{ paystack: false, stripe: false }} limited />
          </div>
        )}

        {tab === 'orders' && orders && (
          <div className="mx-auto h-full max-w-[720px] overflow-auto p-4 md:p-6">
            <OrdersCard projectId={me.projectId} orders={orders} now={now} onSetStatus={async (id, status) => {
              if (!(await adminSetOrderStatusAction(id, status))) throw new Error('not changed');
            }} />
          </div>
        )}

        {tab === 'bookings' && bookings && config.bookings && (
          <div className="mx-auto h-full max-w-[720px] overflow-auto p-4 md:p-6">
            <BookingsCard projectId={me.projectId} bookings={bookings} timezone={config.bookings.timezone} now={now} onSetStatus={async (id, status) => {
              if (!(await adminSetBookingStatusAction(id, status))) throw new Error('not changed');
            }} />
          </div>
        )}
      </div>

      {media && (
        <MediaDialog
          projectId={me.projectId}
          assets={assets}
          onAssetAdded={(a) => setAssets((list) => [a, ...list.filter((x) => x.id !== a.id)])}
          stockSearch={false}
          current={mediaCurrent}
          kind={media.path === 'logo' ? 'logo' : 'photo'}
          onPick={pick}
          onClose={() => setMedia(null)}
          uploadUrl="/api/admin/assets"
        />
      )}
    </div>
  );
}
