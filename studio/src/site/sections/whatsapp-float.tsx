import { MessageCircle } from 'lucide-react';
import type { SectionOf } from '../schema';
import { edit, whatsappHref, type RenderCtx } from '../primitives';

/** Fixed to the bottom corner of the site frame (sticky inside the preview, fixed on a real page). */
export function WhatsappFloat({ section, ctx }: { section: SectionOf<'whatsapp-float'>; ctx: RenderCtx }) {
  const c = section.content;
  if (!c.number) return null;
  const pill = section.variant === 'pill';
  return (
    // A zero-height sticky strip at the end of the page, so the button floats without taking up space.
    <div className="pointer-events-none sticky bottom-0 z-20 h-0">
      <a
        {...edit(ctx, 'label')}
        href={whatsappHref(c.number, c.message)}
        target="_blank"
        rel="noreferrer"
        aria-label={c.label || 'Chat on WhatsApp'}
        className={`pointer-events-auto absolute right-4 bottom-4 flex items-center gap-2 @3xl:right-6 @3xl:bottom-6 bg-[#25D366] font-semibold text-[#0B3B1F] shadow-[0_8px_24px_rgba(0,0,0,.18)] transition-transform hover:scale-105 ${
          pill ? 'h-12 rounded-full px-5' : 'size-14 justify-center rounded-full'
        }`}
      >
        <MessageCircle size={pill ? 20 : 26} strokeWidth={2} aria-hidden />
        {pill && <span>{c.label || 'Chat with us'}</span>}
      </a>
    </div>
  );
}
