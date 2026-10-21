'use client';

/* eslint-disable @next/next/no-img-element */
import { Camera, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { instagramHref, whatsappHref } from '@/site/primitives';

export interface BannerInfo {
  whatsapp: string;
  instagram: string;
  businessName: string;
}

const BANNER_HEIGHT = 60;

/**
 * Wraps a pitch page: logs the visit once per browser session and shows the
 * "Concept by Sono Technologies" banner, which the visitor can hide.
 */
export function PitchShell({ slug, path, banner, children }: { slug: string; path: string; banner: BannerInfo | null; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  // Slides away while reading down the page and comes back on scrolling up, so it never sits over content for long.
  const [tucked, setTucked] = useState(false);
  const show = !!banner && !hidden;

  useEffect(() => {
    if (!show) return;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setTucked(y > last && y > 120);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [show]);

  useEffect(() => {
    const key = `sono-pitch-open:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    fetch(`/api/pitch/${slug}/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {});
    // Logged once per visit, not per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div style={{ '--s-float-offset': show && !tucked ? `${BANNER_HEIGHT + 4}px` : '0px' } as React.CSSProperties}>
      {children}
      {show && (
        <aside
          aria-label="About this concept"
          style={{ height: BANNER_HEIGHT }}
          className={`sticky bottom-0 z-50 flex animate-fade-up items-center gap-3 bg-[#16140F] px-3.5 font-[family-name:var(--font-space-grotesk)] text-[#F7F5F1] shadow-[0_-6px_24px_rgba(0,0,0,.18)] transition-transform duration-300 sm:gap-3.5 sm:px-8 ${tucked ? 'translate-y-full' : ''}`}
        >
          <img src="/logo/sono-mark-inverse.svg" alt="" className="h-4 w-auto flex-none" />
          <span className="min-w-0 flex-1 truncate text-[14px] leading-tight">
            Concept by <span className="font-semibold">Sono Technologies</span>
          </span>
          <div className="flex flex-none gap-2">
            {banner.whatsapp && (
              <a
                href={whatsappHref(banner.whatsapp, `Hi, I saw the website concept for ${banner.businessName}.`)}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp Sono Technologies"
                className="flex h-[38px] items-center gap-1.5 rounded-full bg-[#B4502E] px-3 text-[13px] font-semibold text-white hover:bg-[#A24627] sm:px-4"
              >
                <MessageCircle size={16} className="sm:hidden" aria-hidden />
                <span className="max-sm:hidden">WhatsApp</span>
              </a>
            )}
            {banner.instagram && (
              <a
                href={instagramHref(banner.instagram)}
                target="_blank"
                rel="noreferrer"
                aria-label="Sono Technologies on Instagram"
                className="flex h-[38px] items-center gap-1.5 rounded-full border border-[rgba(247,245,241,.3)] px-3 text-[13px] font-medium hover:bg-white/10 sm:px-4"
              >
                <Camera size={16} className="sm:hidden" aria-hidden />
                <span className="max-sm:hidden">Instagram</span>
              </a>
            )}
          </div>
          <button type="button" onClick={() => setHidden(true)} aria-label="Hide this banner" className="flex size-[38px] flex-none cursor-pointer items-center justify-center rounded-full text-[#A39D90] hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </aside>
      )}
    </div>
  );
}
