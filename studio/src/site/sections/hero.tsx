import type { SectionOf } from '../schema';
import { Container, Eyebrow, Heading, SiteButton, SiteImg, edit, type RenderCtx } from '../primitives';

type Props = { section: SectionOf<'hero'>; ctx: RenderCtx };

function Copy({ section, ctx, center = false, inverse = false }: Props & { center?: boolean; inverse?: boolean }) {
  const c = section.content;
  return (
    <div className={`flex flex-col gap-5 ${center ? 'items-center text-center' : ''}`}>
      <Eyebrow ctx={ctx} text={c.eyebrow} className={inverse ? '!text-current opacity-85' : ''} />
      <Heading ctx={ctx} text={c.heading} level={1} />
      {c.subheading && (
        <p {...edit(ctx, 'subheading')} className={`m-0 max-w-[36em] text-[1.1em] ${inverse ? 'opacity-90' : 'text-site-muted'}`}>
          {c.subheading}
        </p>
      )}
      {(c.primaryCta?.label || c.secondaryCta?.label) && (
        <div className={`flex flex-wrap gap-3 pt-2 ${center ? 'justify-center' : ''}`}>
          <SiteButton ctx={ctx} link={c.primaryCta} path="primaryCta" tone={inverse ? 'inverse' : 'primary'} />
          <SiteButton ctx={ctx} link={c.secondaryCta} path="secondaryCta" tone="secondary" />
        </div>
      )}
    </div>
  );
}

export function Hero({ section, ctx }: Props) {
  const c = section.content;
  switch (section.variant) {
    case 'full-bleed':
      return (
        <section className="relative isolate flex min-h-[78cqi] items-end overflow-hidden text-white @3xl:min-h-[min(46cqi,720px)]">
          <SiteImg ctx={ctx} image={c.image} path="image" rounded={false} eager className="absolute inset-0 -z-20 h-full w-full" />
          {/* Without a photo the striped placeholder is light, so white text needs a much darker wash. */}
          <div
            aria-hidden
            className={`absolute inset-0 -z-10 ${c.image.src ? 'bg-gradient-to-t from-black/65 via-black/25 to-black/5' : 'bg-[color-mix(in_srgb,var(--s-text)_80%,transparent)]'}`}
          />
          <Container className="s-section">
            <div className="max-w-[44em]">
              <Copy section={section} ctx={ctx} inverse />
            </div>
          </Container>
        </section>
      );
    case 'centered':
      return (
        <section className="s-section">
          <Container className="flex flex-col items-center gap-10 @3xl:gap-14">
            <div className="max-w-[46em]">
              <Copy section={section} ctx={ctx} center />
            </div>
            <SiteImg ctx={ctx} image={c.image} path="image" eager className="s-outline aspect-[16/8] w-full" />
          </Container>
        </section>
      );
    case 'oversized-type': {
      return (
        <section className="s-section overflow-hidden">
          <Container className="flex flex-col gap-8">
            <Eyebrow ctx={ctx} text={c.eyebrow} />
            <h1 {...edit(ctx, 'heading')} className="s-heading text-[clamp(var(--s-h1-phone),13cqi,calc(var(--s-h1-desktop)*1.15))] leading-[0.9]">
              {c.heading}
            </h1>
            <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @3xl:items-end">
              <div className="flex flex-col gap-5">
                {c.subheading && (
                  <p {...edit(ctx, 'subheading')} className="m-0 max-w-[30em] text-[1.1em] text-site-muted">
                    {c.subheading}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <SiteButton ctx={ctx} link={c.primaryCta} path="primaryCta" />
                  <SiteButton ctx={ctx} link={c.secondaryCta} path="secondaryCta" tone="secondary" />
                </div>
              </div>
              <SiteImg ctx={ctx} image={c.image} path="image" eager className="s-outline aspect-[4/3] w-full" />
            </div>
          </Container>
        </section>
      );
    }
    case 'split-photo':
    default:
      return (
        <section className="s-section">
          <Container className="grid items-center gap-10 @3xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] @3xl:gap-16">
            <Copy section={section} ctx={ctx} />
            <SiteImg ctx={ctx} image={c.image} path="image" eager className="s-outline aspect-[4/5] w-full @3xl:aspect-[5/6]" />
          </Container>
        </section>
      );
  }
}
