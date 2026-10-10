import type { SectionOf } from '../schema';
import { Container, Eyebrow, Heading, SiteImg, edit, type RenderCtx } from '../primitives';

type Props = { section: SectionOf<'features'>; ctx: RenderCtx };

function Intro({ section, ctx, center = false }: Props & { center?: boolean }) {
  const c = section.content;
  return (
    <div className={`flex max-w-[44em] flex-col gap-4 ${center ? 'mx-auto items-center text-center' : ''}`}>
      <Eyebrow ctx={ctx} text={c.eyebrow} />
      <Heading ctx={ctx} text={c.heading} />
      {c.intro && (
        <p {...edit(ctx, 'intro')} className="m-0 text-site-muted">
          {c.intro}
        </p>
      )}
    </div>
  );
}

export function Features({ section, ctx }: Props) {
  const { items } = section.content;

  if (section.variant === 'price-list') {
    return (
      <section className="s-section">
        <Container className="flex max-w-[880px] flex-col gap-10">
          <Intro section={section} ctx={ctx} center />
          <ul className="m-0 flex list-none flex-col gap-6 p-0">
            {items.map((it, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-3">
                  <h3 {...edit(ctx, `items.${i}.title`)} className="s-heading m-0 text-[1.25em]">
                    {it.title}
                  </h3>
                  <span aria-hidden className="mb-[0.3em] flex-1 border-b border-dotted border-current/35" />
                  {it.price && (
                    <span {...edit(ctx, `items.${i}.price`)} className="font-semibold whitespace-nowrap">
                      {it.price}
                    </span>
                  )}
                </div>
                {it.text && (
                  <p {...edit(ctx, `items.${i}.text`)} className="m-0 max-w-[40em] text-[0.95em] text-site-muted">
                    {it.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    );
  }

  if (section.variant === 'numbered') {
    return (
      <section className="s-section">
        <Container className="grid gap-10 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] @3xl:gap-16">
          <Intro section={section} ctx={ctx} />
          <ol className="m-0 flex list-none flex-col p-0">
            {items.map((it, i) => (
              <li key={i} className="grid grid-cols-[3em_minmax(0,1fr)] gap-4 border-t border-current/15 py-6 first:border-t-0 first:pt-0">
                <span className="s-heading text-[1.5em] text-site-primary">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex flex-col gap-2">
                  <h3 {...edit(ctx, `items.${i}.title`)} className="s-heading m-0 text-[1.3em]">
                    {it.title}
                  </h3>
                  <p {...edit(ctx, `items.${i}.text`)} className="m-0 text-site-muted">
                    {it.text}
                  </p>
                  {it.price && (
                    <span {...edit(ctx, `items.${i}.price`)} className="font-semibold">
                      {it.price}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container className="flex flex-col gap-10 @3xl:gap-14">
        <Intro section={section} ctx={ctx} />
        <ul className="m-0 grid list-none gap-6 p-0 @md:grid-cols-2 @4xl:grid-cols-3">
          {items.map((it, i) => (
            <li key={i} className="s-outline flex flex-col overflow-hidden rounded-site-card bg-site-surface">
              {it.image && (
                <SiteImg ctx={ctx} image={it.image} path={`items.${i}.image`} rounded={false} className="aspect-[4/3] w-full" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 {...edit(ctx, `items.${i}.title`)} className="s-heading m-0 text-[1.3em]">
                    {it.title}
                  </h3>
                  {it.price && (
                    <span {...edit(ctx, `items.${i}.price`)} className="font-semibold whitespace-nowrap text-site-primary">
                      {it.price}
                    </span>
                  )}
                </div>
                <p {...edit(ctx, `items.${i}.text`)} className="m-0 text-[0.95em] text-site-muted">
                  {it.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
