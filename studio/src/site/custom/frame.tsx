'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * An AI-written section in the studio (workspace, preview, pitch links, admin):
 * drawn inside the sandboxed /custom-frame, which grows to fit its content.
 */
export function CustomFrame({ id, js, data, style, fonts, base, editable }: { id: string; js: string; data: unknown; style: string; fonts: string[]; base: string; editable: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only this frame's own messages; they carry nothing but a height.
      if (e.source !== frame.current?.contentWindow || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'sono-custom-ready') setReady(true);
      if (e.data.type === 'sono-custom-height' && e.data.id === id && Number.isFinite(e.data.height)) setHeight(Math.min(8000, Math.max(40, e.data.height)));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({ type: 'sono-custom', id, js, data, style, base }, '*');
  }, [ready, id, js, data, style, base]);

  return (
    <div className="relative">
      <iframe
        ref={frame}
        title="Custom section"
        src={`/custom-frame?f=${encodeURIComponent(fonts.join('|'))}`}
        sandbox="allow-scripts allow-top-navigation-by-user-activation"
        loading="lazy"
        className="block w-full border-0"
        style={{ height }}
      />
      {/* In the editor a click selects the section; the frame can't report clicks. */}
      {editable && <div className="absolute inset-0" aria-hidden />}
    </div>
  );
}
