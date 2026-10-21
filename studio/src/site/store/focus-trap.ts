'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside an open dialog or panel: focus moves into it,
 * Tab and Shift+Tab cycle within it, Escape closes it, and focus goes back to
 * whatever opened it. Used by the studio's dialogs and the sites' cart (it
 * lives here so exported sites get it too).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onClose?: () => void, initial?: RefObject<HTMLElement | null>) {
  // The latest close handler, without restarting the trap when it changes.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const items = () => (box ? [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement) : []);
    (initial?.current ?? items()[0] ?? box)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close.current) {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !box) return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (!box.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // The trap only follows open and closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
