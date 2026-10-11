import type { SectionOf } from '../schema';
import { Container, SiteA, SiteImg, whatsappHref, type RenderCtx } from '../primitives';
import { AddToCart } from '../store/cart';
import { Price } from './product-grid';

type Props = { section: SectionOf<'product-detail'>; ctx: RenderCtx };

/** A product's own page: photos, price, options, description and ordering. */
export function ProductDetail({ section, ctx }: Props) {
  const store = ctx.store;
  const product = store?.products.find((p) => p.id === section.content.productId);
  if (!store || !product) {
    return (
      <section className="s-section">
        <Container className="flex flex-col gap-4">
          <h1 className="s-heading s-h2">This product isn’t available</h1>
          <SiteA ctx={ctx} href="/" className="underline underline-offset-4">
            Back to the shop
          </SiteA>
        </Container>
      </section>
    );
  }
  const photos = [product.image, ...(product.images ?? [])];
  return (
    <section className="s-section">
      <Container className="grid gap-10 @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] @3xl:gap-16">
        <div className={section.variant === 'gallery' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
          {photos.map((img, i) => (
            <SiteImg key={i} ctx={ctx} image={img} path="" eager={i === 0} className={`s-outline aspect-[4/5] w-full ${section.variant === 'gallery' && i === 0 ? 'col-span-2' : ''}`} />
          ))}
        </div>
        <div className="flex flex-col gap-5 @3xl:sticky @3xl:top-6 @3xl:self-start">
          {product.category && <p className="m-0 text-[0.8em] font-semibold tracking-[0.14em] text-site-primary uppercase">{product.category}</p>}
          <h1 className="s-heading s-h2">{product.name}</h1>
          <Price product={product} currency={store.currency} className="text-[1.3em]" />
          {product.description && <p className="m-0 whitespace-pre-line text-site-muted">{product.description}</p>}
          <AddToCart site={ctx.siteKey ?? 'site'} product={{ id: product.id, name: product.name, price: product.price, image: product.image.src }} options={product.options} soldOut={product.soldOut} />
          {store.whatsapp && (
            <a
              href={whatsappHref(store.whatsapp, `Hello, I have a question about ${product.name}.`)}
              target="_blank"
              rel="noreferrer"
              className="text-[0.92em] text-site-muted underline underline-offset-4 hover:text-site-text"
            >
              Ask about this on WhatsApp
            </a>
          )}
        </div>
      </Container>
    </section>
  );
}
