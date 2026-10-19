'use client';

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type UseModalSurfaceInput = {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  freezePage?: boolean;
};

export function useModalSurface({
  open,
  onClose,
  panelRef,
  initialFocusRef,
  returnFocusRef,
  freezePage = false,
}: UseModalSurfaceInput) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const frozenProperties = ['position', 'top', 'left', 'right', 'width'] as const;
    const previousStyles = frozenProperties.map((property) => document.body.style[property]);
    previousFocusRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    document.body.style.overflow = 'hidden';
    if (freezePage) {
      document.body.style.position = 'fixed';
      document.body.style.top = `${-scrollY}px`;
      document.body.style.left = `${-scrollX}px`;
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    const frame = window.requestAnimationFrame(() => {
      const initial =
        initialFocusRef?.current ??
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        panelRef.current;
      initial?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (freezePage) {
        frozenProperties.forEach((property, index) => {
          document.body.style[property] = previousStyles[index]!;
        });
        window.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });
      }
      const target = previousFocusRef.current;
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [freezePage, initialFocusRef, open, panelRef, returnFocusRef]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((control) => !control.hasAttribute('hidden') && control.offsetParent !== null);
    if (!controls.length) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || !panelRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !panelRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  return { onKeyDown };
}
