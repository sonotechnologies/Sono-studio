/* eslint-disable @next/next/no-img-element */
import type { SiteImage, SiteLink, Store } from './schema';

/**
 * Passed to every section. `link` maps a site path ("/about") to wherever the
 * site is being shown (preview route, pitch route, exported app). `editable`
 * adds data-edit markers that the workspace uses for click-to-edit.
 */
export interface RenderCtx {
  link: (href: string) => string;
  editable: boolean;
  /** The site's products and ordering settings, for store sections. */
  store?: Store;
  /** Keeps each site's cart separate in the visitor's browser. */
  siteKey?: string;
}

/** Marks a text or image as editable; the path is relative to the section's content. */
export function edit(ctx: RenderCtx, path: string, kind: 'text' | 'image' | 'link' = 'text') {
  // Product fields live in the store, not the section: they're edited in the Products tab.
  return ctx.editable && path ? { 'data-edit': path, 'data-edit-kind': kind } : {};
}

export function isExternal(href: string) {
  return /^(https?:|tel:|mailto:)/.test(href);
}

export function SiteA({
  ctx,
  href,
  className,
  children,
  ...rest
}: { ctx: RenderCtx; href: string; className?: string; children: React.ReactNode } & Record<`data-${string}`, string>) {
  const external = isExternal(href);
  return (
    <a
      href={href.startsWith('/') ? ctx.link(href) : href}
      className={className}
      {...(external && href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-5 @3xl:px-10 ${className}`}>{children}</div>;
}

export function Eyebrow({ ctx, text, path = 'eyebrow', className = '' }: { ctx: RenderCtx; text: string; path?: string; className?: string }) {
  if (!text) return null;
  return (
    <p {...edit(ctx, path)} className={`m-0 text-[0.8em] font-semibold tracking-[0.14em] uppercase text-site-primary ${className}`}>
      {text}
    </p>
  );
}

export function Heading({
  ctx,
  text,
  path = 'heading',
  level = 2,
  className = '',
}: {
  ctx: RenderCtx;
  text: string;
  path?: string;
  level?: 1 | 2 | 3;
  className?: string;
}) {
  if (!text) return null;
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  const size = level === 1 ? 's-h1' : level === 2 ? 's-h2' : 'text-[1.35em]';
  return (
    <Tag {...edit(ctx, path)} className={`s-heading ${size} ${className}`}>
      {text}
    </Tag>
  );
}

export function SiteButton({
  ctx,
  link,
  path,
  tone = 'primary',
  className = '',
}: {
  ctx: RenderCtx;
  link: SiteLink | undefined;
  path: string;
  tone?: 'primary' | 'secondary' | 'inverse' | 'accent';
  className?: string;
}) {
  if (!link?.label) return null;
  const tones = {
    primary: 'bg-site-primary text-site-on-primary hover:brightness-110',
    secondary: 'border border-current text-current hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]',
    inverse: 'bg-site-bg text-site-text hover:brightness-95',
    accent: 'bg-site-accent text-site-on-accent hover:brightness-105',
  };
  return (
    <SiteA
      ctx={ctx}
      href={link.href}
      {...edit(ctx, path, 'link')}
      className={`inline-flex min-h-11 items-center justify-center rounded-site-button px-6 text-[0.95em] font-semibold transition-[filter,background-color] duration-150 ${tones[tone]} ${className}`}
    >
      {link.label}
    </SiteA>
  );
}

/** A photo, or a striped placeholder with a short label until a photo is chosen. */
export function SiteImg({
  ctx,
  image,
  path,
  className = '',
  rounded = true,
  eager = false,
}: {
  ctx: RenderCtx;
  image: SiteImage | undefined;
  path: string;
  className?: string;
  rounded?: boolean;
  eager?: boolean;
}) {
  const radius = rounded ? 'rounded-site-image' : '';
  if (!image?.src) {
    return (
      <div
        {...edit(ctx, path, 'image')}
        role="img"
        aria-label={image?.alt || 'Photo to come'}
        className={`s-placeholder flex items-end p-3 ${radius} ${className}`}
      >
        <span className="font-mono text-[11px] leading-tight">{image?.alt || 'photo'}</span>
      </div>
    );
  }
  return (
    <img
      {...edit(ctx, path, 'image')}
      src={image.src}
      alt={image.alt}
      loading={eager ? 'eager' : 'lazy'}
      className={`block object-cover ${radius} ${className}`}
    />
  );
}

/** wa.me link with an optional pre-filled message. */
export function whatsappHref(number: string, message = '') {
  const digits = number.replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function instagramHref(handle: string) {
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}
