import { Star } from 'lucide-react';
import type { SectionOf } from '../schema';
import { Container, Heading, edit, type RenderCtx } from '../primitives';

export function Testimonials({ section, ctx }: { section: SectionOf<'testimonials'>; ctx: RenderCtx }) {
  const c = section.content;
  const who = (i: number) => (
    <footer className="flex flex-col text-[0.9em]">
      <span {...edit(ctx, `items.${i}.name`)} className="font-semibold">
        {c.items[i].name}
      </span>
      {c.items[i].detail && (
        <span {...edit(ctx, `items.${i}.detail`)} className="text-site-muted">
          {c.items[i].detail}
        </span>
      )}
    </footer>
  );

  if (section.variant === 'rating-strip') {
    const first = c.items[0];
    return (
      <section className="s-section">
        <Container className="flex max-w-[860px] flex-col items-center gap-6 text-center">
          {c.rating !== undefined && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1 text-site-accent" role="img" aria-label={`Rated ${c.rating} out of 5`}>
                {[0, 1, 2, 3, 4].map((n) => (
                  <Star key={n} size={22} strokeWidth={1.5} fill={n < Math.round(c.rating!) ? 'currentColor' : 'none'} aria-hidden />
                ))}
              </div>
              {c.ratingCount && (
                <span {...edit(ctx, 'ratingCount')} className="text-[0.9em] text-site-muted">
                  {c.rating.toFixed(1)} · {c.ratingCount}
                </span>
              )}
            </div>
          )}
          <Heading ctx={ctx} text={c.heading} />
          {first && (
            <blockquote className="m-0 flex flex-col items-center gap-4">
              <p className="s-heading m-0 text-[1.45em] leading-snug">
                “<span {...edit(ctx, 'items.0.quote')}>{first.quote}</span>”
              </p>
              {who(0)}
            </blockquote>
          )}
        </Container>
      </section>
    );
  }

  if (section.variant === 'cards') {
    return (
      <section className="s-section">
        <Container className="flex flex-col gap-10">
          <Heading ctx={ctx} text={c.heading} />
          <div className="grid gap-5 @3xl:grid-cols-3">
            {c.items.map((t, i) => (
              <blockquote key={i} className="s-outline m-0 flex flex-col justify-between gap-6 rounded-site-card bg-site-surface p-6">
                <p className="m-0">
                  “<span {...edit(ctx, `items.${i}.quote`)}>{t.quote}</span>”
                </p>
                {who(i)}
              </blockquote>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container className="flex flex-col gap-10 @3xl:gap-14">
        <Heading ctx={ctx} text={c.heading} />
        <div className="grid gap-10 @3xl:grid-cols-2 @3xl:gap-16">
          {c.items.slice(0, 2).map((t, i) => (
            <blockquote key={i} className="m-0 flex flex-col gap-5 border-l-2 border-site-accent pl-6">
              <p className="s-heading m-0 text-[1.45em] leading-snug">
                “<span {...edit(ctx, `items.${i}.quote`)}>{t.quote}</span>”
              </p>
              {who(i)}
            </blockquote>
          ))}
        </div>
      </Container>
    </section>
  );
}
