import type { SectionOf } from '../schema';
import { Container, Eyebrow, Heading, SiteImg, edit, type RenderCtx } from '../primitives';

export function About({ section, ctx }: { section: SectionOf<'about'>; ctx: RenderCtx }) {
  const c = section.content;
  const body = c.body.map((p, i) => (
    <p key={i} {...edit(ctx, `body.${i}`)} className="m-0">
      {p}
    </p>
  ));
  const signature = c.signature && (
    <p {...edit(ctx, 'signature')} className="s-heading m-0 text-[1.3em] text-site-primary">
      {c.signature}
    </p>
  );

  if (section.variant === 'statement') {
    return (
      <section className="s-section">
        <Container className="flex max-w-[900px] flex-col items-center gap-6 text-center">
          <Eyebrow ctx={ctx} text={c.eyebrow} />
          <Heading ctx={ctx} text={c.heading} />
          <div className="flex flex-col gap-4 text-[1.08em] text-site-muted">{body}</div>
          {signature}
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container className="grid items-center gap-10 @3xl:grid-cols-2 @3xl:gap-16">
        <SiteImg ctx={ctx} image={c.image} path="image" className="s-outline aspect-[4/5] w-full @3xl:order-none" />
        <div className="flex flex-col gap-5">
          <Eyebrow ctx={ctx} text={c.eyebrow} />
          <Heading ctx={ctx} text={c.heading} />
          <div className="flex flex-col gap-4 text-site-muted">{body}</div>
          {signature}
        </div>
      </Container>
    </section>
  );
}
