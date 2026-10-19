'use client';

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableControls(panel: HTMLElement | null) {
  return Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
    (control) =>
      !control.matches(':disabled') &&
      !control.closest('[hidden], [inert]') &&
      control.getClientRects().length > 0,
  );
}

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
      const preferred = initialFocusRef?.current;
      const initial =
        preferred && !preferred.matches(':disabled') && preferred.getClientRects().length
          ? preferred
          : (focusableControls(panelRef.current)[0] ?? panelRef.current);
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
      // A task handoff can replace this destination while the dialog is open.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const target = returnFocusRef?.current ?? previousFocusRef.current;
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [freezePage, initialFocusRef, open, panelRef, returnFocusRef]);

  // A request can disable the active submit button and leave native focus on body.
  // Recover after that commit, before the next Tab event can miss the panel handler.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel || (panel instanceof HTMLDialogElement && !panel.open)) return;
    const active = document.activeElement;
    if (!panel.contains(active) || (active instanceof HTMLElement && active.matches(':disabled'))) {
      const preferred = initialFocusRef?.current;
      const first =
        preferred && !preferred.matches(':disabled') && preferred.getClientRects().length
          ? preferred
          : (focusableControls(panel)[0] ?? panel);
      first.focus({ preventScroll: true });
    }
  });

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = focusableControls(panelRef.current);
    if (!controls.length) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !controls.includes(document.activeElement as HTMLElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  return { onKeyDown };
}
