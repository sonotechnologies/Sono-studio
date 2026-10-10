import type { SectionOf } from '../schema';
import { Container, Heading, edit, type RenderCtx } from '../primitives';

export function Stats({ section, ctx }: { section: SectionOf<'stats'>; ctx: RenderCtx }) {
  const c = section.content;
  const cards = section.variant === 'cards';
  return (
    <section className="s-section">
      <Container className="flex flex-col gap-10">
        <Heading ctx={ctx} text={c.heading} />
        <dl className={`m-0 grid grid-cols-2 gap-4 ${c.items.length === 3 ? '@3xl:grid-cols-3' : c.items.length === 4 ? '@3xl:grid-cols-4' : ''}`}>
          {c.items.map((s, i) => (
            <div
              key={i}
              className={
                cards
                  ? 's-outline flex flex-col gap-1 rounded-site-card bg-site-surface p-6'
                  : 'flex flex-col gap-1 border-t border-current/20 pt-5'
              }
            >
              <dt {...edit(ctx, `items.${i}.label`)} className="order-2 text-[0.95em] text-site-muted">
                {s.label}
              </dt>
              <dd {...edit(ctx, `items.${i}.value`)} className="s-heading order-1 m-0 s-h2 text-site-primary">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
