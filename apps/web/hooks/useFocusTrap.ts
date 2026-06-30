'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus inside an overlay while it is open.
 *
 * On open, focus moves to the first focusable element inside the container (or
 * the container itself); Tab / Shift+Tab cycle within it; on close, focus is
 * restored to whatever was focused before the overlay opened. Used by the
 * non-native overlays (SlideOver) — native `<dialog>.showModal()` already does
 * this, so Modal doesn't need it.
 *
 * Returns a ref to attach to the overlay container.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus into the overlay.
    const first = focusables()[0];
    (first ?? container).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // Restore focus to where it was before the overlay opened.
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return containerRef;
}
