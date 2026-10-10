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
    <div className={`sono-site ${className}`} style={themeStyle(config.theme)}>
      <div className="s-root" lang={config.meta.language}>
        {page.sections
          .filter((s) => !s.hidden)
          .map((s) => (
            <div
              key={s.id}
              // Section ids double as anchors (/#offer). The floating WhatsApp button must not get its own box,
              // or it could only stick within it.
              id={s.type === 'whatsapp-float' ? undefined : s.id}
              className={s.type === 'whatsapp-float' ? 'contents' : 'scroll-mt-4'}
              {...(ctx.editable ? { 'data-section-id': s.id, 'data-section-type': s.type } : {})}
            >
              {renderSection(s, ctx)}
            </div>
          ))}
      </div>
    </div>
  );
}
