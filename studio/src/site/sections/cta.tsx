import type { SectionOf } from '../schema';
import { Container, Heading, SiteButton, SiteImg, edit, type RenderCtx } from '../primitives';

export function Cta({ section, ctx }: { section: SectionOf<'cta'>; ctx: RenderCtx }) {
  const c = section.content;
  const text = c.text && (
    <p {...edit(ctx, 'text')} className="m-0 max-w-[36em] text-[1.05em] opacity-85">
      {c.text}
    </p>
  );

  if (section.variant === 'banner') {
    return (
      <section className="s-section bg-site-primary text-site-on-primary">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Heading ctx={ctx} text={c.heading} />
          {text}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <SiteButton ctx={ctx} link={c.button} path="button" tone="inverse" />
            <SiteButton ctx={ctx} link={c.secondary} path="secondary" tone="secondary" />
          </div>
        </Container>
      </section>
    );
  }

  if (section.variant === 'split') {
    return (
      <section className="s-section">
        <Container>
          <div className="s-outline grid overflow-hidden rounded-site-card bg-site-surface @3xl:grid-cols-2">
            <div className="flex flex-col justify-center gap-5 p-8 @3xl:p-12">
              <Heading ctx={ctx} text={c.heading} />
              {text}
              <div className="flex flex-wrap gap-3 pt-2">
                <SiteButton ctx={ctx} link={c.button} path="button" />
                <SiteButton ctx={ctx} link={c.secondary} path="secondary" tone="secondary" />
              </div>
            </div>
            <SiteImg ctx={ctx} image={c.image} path="image" rounded={false} className="min-h-[240px] w-full @3xl:h-full" />
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container>
        <div className="s-outline flex flex-col items-start gap-5 rounded-site-card bg-site-accent p-8 text-site-on-accent @3xl:flex-row @3xl:items-center @3xl:justify-between @3xl:p-12">
          <div className="flex max-w-[40em] flex-col gap-3">
            <Heading ctx={ctx} text={c.heading} />
            {text}
          </div>
          <SiteButton ctx={ctx} link={c.button} path="button" />
        </div>
      </Container>
    </section>
  );
}
