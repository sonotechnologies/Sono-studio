'use client';

import { useEffect } from 'react';

/**
 * Closes the phone menu (a native disclosure, so it opens without JavaScript)
 * with Escape, a tap outside it or a tap on one of its links, and puts focus
 * back on its button after Escape.
 */
export function MenuCloser() {
  useEffect(() => {
    const open = () => [...document.querySelectorAll<HTMLDetailsElement>('details[data-site-menu][open]')];
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      for (const d of open()) {
        d.open = false;
        d.querySelector('summary')?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      for (const d of open()) if (!d.contains(target) || target.closest('a')) d.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return null;
}
