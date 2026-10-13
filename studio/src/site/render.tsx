import type { RenderCtx } from './primitives';
import { renderSection } from './registry';
import type { SiteConfig, SitePage } from './schema';
import { themeStyle } from './theme';
import { CartDrawer } from './store/cart';

/** A page by path. Product pages ("/product/<id>") are made from the home page's navbar and footer. */
export function findPage(config: SiteConfig, path: string): SitePage | undefined {
  const page = config.pages.find((p) => p.path === path);
  if (page) return page;
  const m = /^\/product\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path);
  const product = m && config.store?.products.find((p) => p.id === m[1]);
  return product ? productPage(config, product.id) : undefined;
}

export function productPage(config: SiteConfig, productId: string): SitePage {
  const home = config.pages.find((p) => p.path === '/') ?? config.pages[0];
  const product = config.store?.products.find((p) => p.id === productId);
  const shared = (type: string) => home.sections.filter((s) => s.type === type);
  return {
    id: 'product',
    path: `/product/${productId}`,
    title: product?.name ?? 'Product',
    sections: [
      ...shared('navbar'),
      { id: 'product-detail', type: 'product-detail', variant: 'gallery', content: { productId } },
      ...shared('footer'),
      ...shared('whatsapp-float'),
    ],
  };
}

/** The page an order confirmation sits in: the home page's navbar, footer and WhatsApp button. */
export function orderPage(config: SiteConfig): SitePage {
  const home = config.pages.find((p) => p.path === '/') ?? config.pages[0];
  return { id: 'order', path: '/order', title: 'Your order', sections: home.sections.filter((s) => s.type === 'navbar' || s.type === 'footer' || s.type === 'whatsapp-float') };
}

/** A style object as CSS text ("--s-bg:#fff;..."), for the custom-section frame. */
function cssText(style: Record<string, unknown>): string {
  return Object.entries(style)
    .map(([k, v]) => `${k}:${String(v)}`)
    .join(';');
}

/** A short, stable key for the site's cart in the visitor's browser. */
export function siteKey(config: SiteConfig): string {
  return config.meta.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'site';
}

/**
 * Renders one page of a site config. Used by the preview, the library and
 * (later) pitch links; the export step generates equivalent standalone code.
 */
export function SitePageView({
  config,
  page,
  ctx,
  className = '',
  insert,
}: {
  config: SiteConfig;
  page: SitePage;
  ctx: RenderCtx;
  className?: string;
  /** Shown after the navbar, e.g. an order confirmation. */
  insert?: React.ReactNode;
}) {
  const store = config.store;
  const key = siteKey(config);
  const sectionCtx: RenderCtx = {
    ...ctx,
    ...(store ? { store } : {}),
    ...(config.bookings ? { bookings: config.bookings } : {}),
    ...(config.customSections ? { customSections: config.customSections, themeCss: cssText(themeStyle(config.theme) as Record<string, unknown>), fonts: [config.theme.fonts.heading, config.theme.fonts.body] } : {}),
    siteKey: key,
    businessName: config.meta.businessName,
  };
  return (
    <div className={`sono-site ${className}`} style={themeStyle(config.theme)} data-motion={config.theme.motion ?? 'none'}>
      <div className="s-root" lang={config.meta.language}>
        {page.sections
          .filter((s) => !s.hidden)
          .map((s, i, list) => [
            <div
              key={s.id}
              // Section ids double as anchors (/#offer). The floating WhatsApp button must not get its own box,
              // or it could only stick within it.
              id={s.type === 'whatsapp-float' ? undefined : s.id}
              // A sticky navbar sticks on its wrapper, which spans the page; on the header itself it would stay inside its own box.
              className={s.type === 'whatsapp-float' ? 'contents' : s.type === 'navbar' && s.content.sticky ? 'sticky top-0 z-40' : 'scroll-mt-4'}
              data-s={s.type}
              {...(ctx.editable ? { 'data-section-id': s.id, 'data-section-type': s.type } : {})}
            >
              {renderSection(s, sectionCtx)}
            </div>,
            insert && (s.type === 'navbar' ? !list.slice(0, i).some((x) => x.type === 'navbar') : i === 0 && !list.some((x) => x.type === 'navbar')) ? <main key="insert">{insert}</main> : null,
          ])}
        {store && store.products.length > 0 && !ctx.editable && (
          <CartDrawer
            site={key}
            business={config.meta.businessName}
            currency={store.currency}
            whatsapp={!store.payments || store.payments.whatsapp ? store.whatsapp : ''}
            checkout={ctx.checkout?.providers.length ? ctx.checkout : undefined}
          />
        )}
      </div>
    </div>
  );
}
