import type { SectionOf } from '../schema';
import { Container, Eyebrow, MainOr2, edit, type RenderCtx } from '../primitives';
import { BookingWidget } from '../store/booking-widget';

type Props = { section: SectionOf<'booking'>; ctx: RenderCtx };

/** Online booking: services, free times and a deposit or WhatsApp request. */
export function Booking({ section, ctx }: Props) {
  const c = section.content;
  const split = section.variant === 'split';
  return (
    <section className="s-section">
      <Container className={split ? 'grid gap-10 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] @3xl:gap-16' : 'flex max-w-[760px] min-w-0 flex-col gap-8'}>
        <div className="flex flex-col gap-3">
          <Eyebrow ctx={ctx} text={c.eyebrow} />
          <MainOr2 ctx={ctx} {...edit(ctx, 'heading')} className="s-heading s-h2 m-0">
            {c.heading}
          </MainOr2>
          {c.intro && (
            <p {...edit(ctx, 'intro')} className="m-0 max-w-[36em] text-site-muted">
              {c.intro}
            </p>
          )}
        </div>
        {ctx.bookings ? (
          <BookingWidget bookings={ctx.bookings} business={ctx.businessName ?? ''} category={c.category} live={ctx.editable ? undefined : ctx.booking} />
        ) : (
          <p className="m-0 text-site-muted">Services and booking times appear here once bookings are set up.</p>
        )}
      </Container>
    </section>
  );
}
