import type { SectionOf } from '../schema';
import { Container, Eyebrow, SiteA, SiteImg, edit, type RenderCtx } from '../primitives';
import { AddToCart } from '../store/cart';
import { Price } from './product-grid';

type Props = { section: SectionOf<'product-feature'>; ctx: RenderCtx };

/** One product, large: a launch, a bestseller or the dish of the week. */
export function ProductFeature({ section, ctx }: Props) {
  const c = section.content;
  const store = ctx.store;
  const product = store?.products.find((p) => p.id === c.productId) ?? store?.products[0];
  if (!store || !product) {
    return (
      <section className="s-section">
        <Container>
          <p className="m-0 text-site-muted">The featured product appears here once products are added.</p>
        </Container>
      </section>
    );
  }
  const centered = section.variant === 'centered';
  return (
    <section className="s-section">
      <Container className={centered ? 'flex flex-col items-center gap-8 text-center' : 'grid items-center gap-10 @3xl:grid-cols-2 @3xl:gap-16'}>
        <SiteA ctx={ctx} href={`/product/${product.id}`} className={centered ? 'block w-full max-w-[560px]' : 'block'}>
          <SiteImg ctx={ctx} image={product.image} path="" className="s-outline aspect-[4/5] w-full" />
        </SiteA>
        <div className={`flex flex-col gap-4 ${centered ? 'items-center' : ''}`}>
          <Eyebrow ctx={ctx} text={c.eyebrow} />
          <h2 {...(c.heading ? edit(ctx, 'heading') : {})} className="s-heading s-h2">
            {c.heading || product.name}
          </h2>
          <Price product={product} currency={store.currency} className="text-[1.2em]" />
          {product.description && <p className="m-0 max-w-[36em] text-site-muted">{product.description}</p>}
          <AddToCart site={ctx.siteKey ?? 'site'} product={{ id: product.id, name: product.name, price: product.price, image: product.image.src }} options={product.options} soldOut={product.soldOut} className={centered ? 'items-center' : 'items-start'} />
        </div>
      </Container>
    </section>
  );
}
