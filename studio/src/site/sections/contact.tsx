import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { SectionOf } from '../schema';
import { Container, Heading, SiteImg, edit, whatsappHref, type RenderCtx } from '../primitives';

type Props = { section: SectionOf<'contact'>; ctx: RenderCtx };

function Lines({ section, ctx }: Props) {
  const c = section.content;
  const row = (icon: React.ReactNode, body: React.ReactNode) => (
    <li className="flex gap-3">
      <span className="mt-[0.2em] flex-none text-site-accent">{icon}</span>
      <span className="min-w-0">{body}</span>
    </li>
  );
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {c.address && row(<MapPin size={18} strokeWidth={2} aria-hidden />, <span {...edit(ctx, 'address')}>{c.address}</span>)}
      {c.phone &&
        row(
          <Phone size={18} strokeWidth={2} aria-hidden />,
          <a {...edit(ctx, 'phone')} href={`tel:${c.phone.replace(/[^+0-9]/g, '')}`} className="underline-offset-4 hover:underline">
            {c.phone}
          </a>,
        )}
      {c.whatsapp &&
        row(
          <MessageCircle size={18} strokeWidth={2} aria-hidden />,
          <a {...edit(ctx, 'whatsapp')} href={whatsappHref(c.whatsapp)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            WhatsApp {c.whatsapp}
          </a>,
        )}
      {c.email &&
        row(
          <Mail size={18} strokeWidth={2} aria-hidden />,
          <a {...edit(ctx, 'email')} href={`mailto:${c.email}`} className="underline-offset-4 hover:underline">
            {c.email}
          </a>,
        )}
      {c.hours.length > 0 &&
        row(
          <Clock size={18} strokeWidth={2} aria-hidden />,
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            {c.hours.map((h, i) => (
              <div key={i} className="contents">
                <dt {...edit(ctx, `hours.${i}.days`)} className="text-site-muted">
                  {h.days}
                </dt>
                <dd {...edit(ctx, `hours.${i}.time`)} className="m-0">
                  {h.time}
                </dd>
              </div>
            ))}
          </dl>,
        )}
    </ul>
  );
}

function MapFrame({ section, ctx }: Props) {
  const q = section.content.mapQuery;
  if (!q) return <SiteImg ctx={ctx} image={{ src: '', alt: 'map' }} path="mapQuery" className="s-outline aspect-[4/3] w-full" />;
  return (
    <iframe
      {...edit(ctx, 'mapQuery', 'link')}
      title={`Map showing ${q}`}
      src={`https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className="s-outline aspect-[4/3] w-full rounded-site-image border-0"
    />
  );
}

export function Contact({ section, ctx }: Props) {
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

  if (section.variant === 'card') {
    return (
      <section className="s-section">
        <Container className="max-w-[760px]">
          <div className="s-outline flex flex-col gap-8 rounded-site-card bg-site-surface p-8 @3xl:p-12">
            {intro}
            <Lines section={section} ctx={ctx} />
            {c.whatsapp && (
              <a
                href={whatsappHref(c.whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-site-button bg-site-primary px-6 font-semibold text-site-on-primary hover:brightness-110"
              >
                <MessageCircle size={18} strokeWidth={2} aria-hidden />
                Message us on WhatsApp
              </a>
            )}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="s-section">
      <Container className="grid gap-10 @3xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] @3xl:gap-16">
        <div className="flex flex-col gap-8">
          {intro}
          <Lines section={section} ctx={ctx} />
        </div>
        <MapFrame section={section} ctx={ctx} />
      </Container>
    </section>
  );
}
