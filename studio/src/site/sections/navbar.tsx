/* eslint-disable @next/next/no-img-element */
import { Menu, X } from 'lucide-react';
import type { SectionOf } from '../schema';
import { Container, SiteA, SiteButton, edit, type RenderCtx } from '../primitives';

function Brand({ section, ctx, large = false }: { section: SectionOf<'navbar'>; ctx: RenderCtx; large?: boolean }) {
  const { brand, logo } = section.content;
  return (
    <SiteA ctx={ctx} href="/" className="flex min-h-11 items-center gap-3">
      {logo?.src ? (
        <img {...edit(ctx, 'logo', 'image')} src={logo.src} alt={logo.alt || brand} className={large ? 'h-12 w-auto' : 'h-9 w-auto'} />
      ) : (
        <span {...edit(ctx, 'brand')} className={`s-heading ${large ? 'text-[1.9em]' : 'text-[1.35em]'}`}>
          {brand}
        </span>
      )}
    </SiteA>
  );
}

/** Phone menu: a native disclosure, so it works without JavaScript. */
function PhoneMenu({ section, ctx }: { section: SectionOf<'navbar'>; ctx: RenderCtx }) {
  const { links, cta } = section.content;
  if (!links.length && !cta) return null;
  return (
    <details className="group @3xl:hidden">
      <summary
        aria-label="Menu"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-site-button border border-current/20 [&::-webkit-details-marker]:hidden"
      >
        {/* A close (×) button while the menu is open. */}
        <Menu size={20} strokeWidth={2} aria-hidden className="group-open:hidden" />
        <X size={20} strokeWidth={2} aria-hidden className="hidden group-open:block" />
      </summary>
      <div className="absolute inset-x-0 top-full z-30 border-b border-current/10 bg-site-bg px-5 pt-2 pb-5 shadow-[0_12px_24px_rgba(0,0,0,.08)]">
        <nav className="flex flex-col">
          {links.map((l, i) => (
            <SiteA key={i} ctx={ctx} href={l.href} {...edit(ctx, `links.${i}`, 'link')} className="flex min-h-12 items-center border-b border-current/10 text-[1.05em]">
              {l.label}
            </SiteA>
          ))}
        </nav>
        <SiteButton ctx={ctx} link={cta} path="cta" className="mt-4 w-full" />
      </div>
    </details>
  );
}

export function Navbar({ section, ctx }: { section: SectionOf<'navbar'>; ctx: RenderCtx }) {
  const { links, cta } = section.content;
  const desktopLinks = (
    <nav aria-label="Main" className="hidden items-center gap-7 @3xl:flex">
      {links.map((l, i) => (
        <SiteA key={i} ctx={ctx} href={l.href} {...edit(ctx, `links.${i}`, 'link')} className="text-[0.95em] opacity-80 transition-opacity hover:opacity-100">
          {l.label}
        </SiteA>
      ))}
    </nav>
  );

  if (section.variant === 'centered') {
    return (
      <header className="relative bg-site-bg">
        <Container className="flex items-center justify-between gap-4 py-4 @3xl:flex-col @3xl:gap-3 @3xl:py-6">
          <Brand section={section} ctx={ctx} large />
          <div className="flex items-center gap-8">
            {desktopLinks}
            <span className="hidden @3xl:block">
              <SiteButton ctx={ctx} link={cta} path="cta" tone="secondary" />
            </span>
          </div>
          <PhoneMenu section={section} ctx={ctx} />
        </Container>
      </header>
    );
  }

  return (
    <header className="relative bg-site-bg">
      <Container className="flex items-center justify-between gap-6 py-4">
        <Brand section={section} ctx={ctx} />
        <div className="flex items-center gap-8">
          {desktopLinks}
          <span className="hidden @3xl:block">
            <SiteButton ctx={ctx} link={cta} path="cta" />
          </span>
        </div>
        <PhoneMenu section={section} ctx={ctx} />
      </Container>
    </header>
  );
}
