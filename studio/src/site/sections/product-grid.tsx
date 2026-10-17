import type { Product, SectionOf } from '../schema';
import { Container, Eyebrow, Heading, SiteA, SiteImg, edit, type RenderCtx } from '../primitives';
import { AddToCart } from '../store/cart';
import { CategoryFilter } from '../store/filter';
import { formatPrice } from '../store/format';

type Props = { section: SectionOf<'product-grid'>; ctx: RenderCtx };

export function Price({ product, currency, className = '' }: { product: Product; currency: string; className?: string }) {
  return (
    <span className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-semibold">{formatPrice(product.price, currency)}</span>
      {product.compareAt && product.compareAt > product.price ? <s className="text-[0.85em] text-site-muted">{formatPrice(product.compareAt, currency)}</s> : null}
    </span>
  );
}

export function productHref(ctx: RenderCtx, p: Product) {
  return ctx.link(`/product/${p.id}`);
}

function Card({ product, ctx, variant, currency }: { product: Product; ctx: RenderCtx; variant: Props['section']['variant']; currency: string }) {
  const href = `/product/${product.id}`;
  const add = (
    <AddToCart
      site={ctx.siteKey ?? 'site'}
      product={{ id: product.id, name: product.name, price: product.price, image: product.image.src }}
      options={product.options}
      soldOut={product.soldOut}
      compact
    />
  );
  if (variant === 'list') {
    return (
      <article className="flex gap-4 border-b border-current/10 py-4 @3xl:items-center" data-product-id={product.id}>
        <SiteA ctx={ctx} href={href} className="block w-24 flex-none @3xl:w-32">
          <SiteImg ctx={ctx} image={product.image} path="" className="s-outline aspect-square w-full rounded-site-card" />
        </SiteA>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <SiteA ctx={ctx} href={href} className="s-heading text-[1.15em] hover:underline">
            {product.name}
          </SiteA>
          {product.description && <p className="m-0 line-clamp-2 text-[0.92em] text-site-muted">{product.description}</p>}
          <Price product={product} currency={currency} />
        </div>
        <div className="hidden flex-none @3xl:block">{add}</div>
      </article>
    );
  }
  return (
    <article className={`flex flex-col gap-3 ${variant === 'cards' ? 's-outline rounded-site-card bg-site-surface p-3' : ''}`} data-product-id={product.id}>
      <SiteA ctx={ctx} href={href} className="relative block">
        <SiteImg ctx={ctx} image={product.image} path="" className="aspect-[4/5] w-full" />
        {product.soldOut && <span className="absolute top-3 left-3 rounded-full bg-site-text px-3 py-1 text-[0.75em] font-semibold text-site-bg">Sold out</span>}
        {product.compareAt && product.compareAt > product.price && !product.soldOut && (
          <span className="absolute top-3 left-3 rounded-full bg-site-accent px-3 py-1 text-[0.75em] font-semibold text-site-on-accent">Sale</span>
        )}
      </SiteA>
      <div className={`flex flex-col gap-1 ${variant === 'cards' ? 'px-1' : ''}`}>
        <SiteA ctx={ctx} href={href} className="font-semibold hover:underline">
          {product.name}
        </SiteA>
        <Price product={product} currency={currency} className="text-site-muted" />
      </div>
      {variant === 'cards' && <div className="mt-auto px-1 pb-1">{add}</div>}
    </article>
  );
}

export function ProductGrid({ section, ctx }: Props) {
  const c = section.content;
  const store = ctx.store;
  const all = (store?.products ?? []).filter((p) => !c.category || p.category === c.category);
  const products = c.limit ? all.slice(0, c.limit) : all;
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))];
  const grid =
    section.variant === 'list'
      ? 'flex flex-col'
      : `grid ${c.phoneColumns === 1 ? 'grid-cols-1 @xl:grid-cols-2' : 'grid-cols-2'} gap-x-4 gap-y-8 @3xl:grid-cols-3 @3xl:gap-x-6 @6xl:grid-cols-4`;
  const cards = products.map((p) => (
    <div key={p.id} data-cat={p.category} className="contents">
      <Card product={p} ctx={ctx} variant={section.variant} currency={store!.currency} />
    </div>
  ));
  return (
    <section className="s-section">
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-[44em] flex-col gap-4">
          <Eyebrow ctx={ctx} text={c.eyebrow} />
          <Heading ctx={ctx} text={c.heading} />
          {c.intro && (
            <p {...edit(ctx, 'intro')} className="m-0 text-site-muted">
              {c.intro}
            </p>
          )}
        </div>
        {!store || !products.length ? (
          <p className="m-0 text-site-muted">Products appear here once they’re added.</p>
        ) : c.filter && categories.length > 1 ? (
          <CategoryFilter categories={categories} className={grid}>
            {cards}
          </CategoryFilter>
        ) : (
          <div className={grid}>{cards}</div>
        )}
      </Container>
    </section>
  );
}
