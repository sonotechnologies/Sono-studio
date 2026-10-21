import type { SectionOf } from '../schema';
import { Container, Heading, SiteImg, edit, type RenderCtx } from '../primitives';

export function Gallery({ section, ctx }: { section: SectionOf<'gallery'>; ctx: RenderCtx }) {
  const c = section.content;
  const head = (c.heading || c.intro) && (
    <div className="flex max-w-[44em] flex-col gap-4">
      <Heading ctx={ctx} text={c.heading} />
      {c.intro && (
        <p {...edit(ctx, 'intro')} className="m-0 text-site-muted">
          {c.intro}
        </p>
      )}
    </div>
  );

  if (section.variant === 'strip') {
    return (
      <section className="s-section">
        {head && <Container className="pb-10">{head}</Container>}
        <div className="flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 @3xl:scroll-px-10 @3xl:px-10">
          {c.images.map((img, i) => (
            <SiteImg
              key={i}
              ctx={ctx}
              image={img}
              path={`images.${i}`}
              className="s-outline aspect-[4/5] w-[70cqi] flex-none snap-start @3xl:w-[30cqi]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (section.variant === 'masonry') {
    return (
      <section className="s-section">
        <Container className="flex flex-col gap-10">
          {head}
          <div className="columns-2 gap-3 @3xl:columns-3 @3xl:gap-4">
            {c.images.map((img, i) => (
              <SiteImg
                key={i}
                ctx={ctx}
                image={img}
                path={`images.${i}`}
                className={`s-outline mb-3 w-full break-inside-avoid @3xl:mb-4 ${i % 3 === 0 ? 'aspect-[3/4]' : i % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]'}`}
              />
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container className="flex flex-col gap-10">
        {head}
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:gap-4">
          {c.images.slice(0, 8).map((img, i) => (
            <SiteImg key={i} ctx={ctx} image={img} path={`images.${i}`} className="s-outline aspect-[3/4] w-full" />
          ))}
        </div>
      </Container>
    </section>
  );
}
