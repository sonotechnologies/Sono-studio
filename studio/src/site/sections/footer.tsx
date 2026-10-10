import type { SectionOf } from '../schema';
import { Container, SiteA, edit, instagramHref, whatsappHref, type RenderCtx } from '../primitives';

export function Footer({ section, ctx }: { section: SectionOf<'footer'>; ctx: RenderCtx }) {
  const c = section.content;
  const social = (
    <div className="flex flex-wrap gap-5 text-[0.95em]">
      {c.instagram && (
        <a {...edit(ctx, 'instagram')} href={instagramHref(c.instagram)} target="_blank" rel="noreferrer" className="hover:underline">
          Instagram {c.instagram}
        </a>
      )}
      {c.whatsapp && (
        <a {...edit(ctx, 'whatsapp')} href={whatsappHref(c.whatsapp)} target="_blank" rel="noreferrer" className="hover:underline">
          WhatsApp
        </a>
      )}
    </div>
  );
  const note = c.note && (
    <p {...edit(ctx, 'note')} className="m-0 text-[0.85em] text-site-muted">
      {c.note}
    </p>
  );

  if (section.variant === 'columns') {
    return (
      <footer className="border-t border-current/15 bg-site-surface py-14">
        <Container className="flex flex-col gap-12">
          <div className="grid gap-10 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex max-w-[24em] flex-col gap-3">
              <span {...edit(ctx, 'brand')} className="s-heading text-[1.6em]">
                {c.brand}
              </span>
              {c.tagline && (
                <p {...edit(ctx, 'tagline')} className="m-0 text-site-muted">
                  {c.tagline}
                </p>
              )}
            </div>
            <nav aria-label="Footer" className="flex flex-col gap-3">
              {c.links.map((l, i) => (
                <SiteA key={i} ctx={ctx} href={l.href} {...edit(ctx, `links.${i}`, 'link')} className="hover:underline">
                  {l.label}
                </SiteA>
              ))}
            </nav>
            <div className="flex flex-col gap-3">{social}</div>
          </div>
          {note}
        </Container>
      </footer>
    );
  }

  return (
    <footer className="border-t border-current/15 py-10">
      <Container className="flex flex-col gap-6 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="flex flex-col gap-1">
          <span {...edit(ctx, 'brand')} className="s-heading text-[1.3em]">
            {c.brand}
          </span>
          {note}
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-5 text-[0.95em]">
          {c.links.map((l, i) => (
            <SiteA key={i} ctx={ctx} href={l.href} {...edit(ctx, `links.${i}`, 'link')} className="hover:underline">
              {l.label}
            </SiteA>
          ))}
        </nav>
        {social}
      </Container>
    </footer>
  );
}
