import { Plus } from 'lucide-react';
import type { SectionOf } from '../schema';
import { Container, Heading, edit, type RenderCtx } from '../primitives';

export function Faq({ section, ctx }: { section: SectionOf<'faq'>; ctx: RenderCtx }) {
  const c = section.content;
  const intro = (
    <div className="flex flex-col gap-4">
      <Heading ctx={ctx} text={c.heading} />
      {c.intro && (
        <p {...edit(ctx, 'intro')} className="m-0 text-site-muted">
          {c.intro}
        </p>
      )}
    </div>
  );

  if (section.variant === 'two-column') {
    return (
      <section className="s-section">
        <Container className="flex flex-col gap-10">
          {intro}
          <dl className="m-0 grid gap-x-12 gap-y-8 @3xl:grid-cols-2">
            {c.items.map((q, i) => (
              <div key={i} className="flex flex-col gap-2">
                <dt {...edit(ctx, `items.${i}.question`)} className="s-heading text-[1.2em]">
                  {q.question}
                </dt>
                <dd {...edit(ctx, `items.${i}.answer`)} className="m-0 text-site-muted">
                  {q.answer}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container className="grid gap-10 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] @3xl:gap-16">
        {intro}
        <div className="flex flex-col border-t border-current/15">
          {c.items.map((q, i) => (
            <details key={i} className="group border-b border-current/15">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4">
                <span {...edit(ctx, `items.${i}.question`)} className="font-semibold">
                  {q.question}
                </span>
                <Plus size={20} strokeWidth={2} aria-hidden className="flex-none transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p {...edit(ctx, `items.${i}.answer`)} className="m-0 pb-5 text-site-muted">
                {q.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
