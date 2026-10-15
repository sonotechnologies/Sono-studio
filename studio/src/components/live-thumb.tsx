'use client';

import { useEffect, useRef, useState } from 'react';

/** The width the page is laid out at before it's scaled down: a desktop browser. */
const PAGE_WIDTH = 1280;

/**
 * A site's real page, scaled down to fit a card: loaded in a frame with
 * scripts off once the card comes into view, and not clickable (the card is
 * the link). The placeholder underneath shows until it has loaded.
 */
export function LiveThumb({ src, className = '', children }: { src: string | null; className?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / PAGE_WIDTH);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setLoaded(false), [src]);

  return (
    <div ref={box} aria-hidden className={`relative overflow-hidden ${className}`}>
      {children}
      {src && scale > 0 && (
        <iframe
          src={src}
          title=""
          tabIndex={-1}
          loading="lazy"
          // No scripts: the page's HTML and CSS are enough for a picture of it.
          sandbox="allow-same-origin"
          onLoad={() => setLoaded(true)}
          style={{ width: PAGE_WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}
          className={`pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}

/** Where a project's thumbnail comes from: its latest version, or its copy. */
export function thumbSrc(p: { id: string; currentVersion: number | null }, copy?: { home: string; version: string }): string | null {
  if (p.currentVersion !== null) return `/thumb/${p.id}?v=${p.currentVersion}`;
  if (copy) return `/copy/${p.id}/${copy.home}?thumb=1&v=${encodeURIComponent(copy.version)}`;
  return null;
}
