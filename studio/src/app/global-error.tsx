'use client';

import { useEffect } from 'react';

/**
 * The last resort when a page fails. A page left open across a new deploy can
 * ask for code that no longer exists; one automatic reload fixes that, so it
 * reloads once by itself and only shows this screen if that didn't help.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const key = 'sono-reloaded-after-error';
    let reloaded = false;
    try {
      // Reloaded for this page in the last minute already: don't loop.
      const [href, at] = (sessionStorage.getItem(key) ?? '').split('|');
      reloaded = href === location.href && Date.now() - Number(at) < 60_000;
      if (!reloaded) sessionStorage.setItem(key, `${location.href}|${Date.now()}`);
    } catch {}
    if (!reloaded) location.reload();
  }, []);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0, background: '#16140F', color: '#F7F5F1' }}>
        <div style={{ maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>This page couldn’t load</h1>
          <p style={{ margin: 0, opacity: 0.75, fontSize: 15 }}>Reload to try again. If it keeps happening, send this to support:</p>
          <code style={{ fontSize: 12, opacity: 0.6, wordBreak: 'break-word' }}>{error.digest ?? error.message?.slice(0, 200)}</code>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => location.reload()} style={{ padding: '10px 18px', borderRadius: 999, border: 0, background: '#F7F5F1', color: '#16140F', fontWeight: 600, cursor: 'pointer' }}>
              Reload
            </button>
            <button type="button" onClick={() => reset()} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #ffffff33', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
