import type { RenderCtx } from './primitives';
import { renderSection } from './registry';
import type { SiteConfig, SitePage } from './schema';
import { themeStyle } from './theme';

export function findPage(config: SiteConfig, path: string): SitePage | undefined {
  return config.pages.find((p) => p.path === path);
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
}: {
  config: SiteConfig;
  page: SitePage;
  ctx: RenderCtx;
  className?: string;
}) {
  return (
    <div className={`sono-site ${className}`} style={themeStyle(config.theme)} data-motion={config.theme.motion ?? 'none'}>
      <div className="s-root" lang={config.meta.language}>
        {page.sections
          .filter((s) => !s.hidden)
          .map((s) => (
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
              {renderSection(s, ctx)}
            </div>
          ))}
      </div>
    </div>
  );
}
