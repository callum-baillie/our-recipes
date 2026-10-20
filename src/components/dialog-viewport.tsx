'use client';
import { useEffect } from 'react';
/** Keep native modal bounds inside the visible viewport when mobile keyboards open. */
export function DialogViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let focusFrame: number | null = null;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--dialog-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--dialog-viewport-top', `${top}px`);
      document.documentElement.style.setProperty(
        '--dialog-viewport-bottom',
        `${Math.max(0, window.innerHeight - height - top)}px`,
      );
    };
    const resized = () => {
      update();
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          focused.matches(
            'input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]',
          ) &&
          focused.closest('dialog[open]')
        ) {
          focused.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }
      });
    };
    const revealFocusedControl = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return;
      const dialog = focused.closest('dialog[open]');
      if (!dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const header = dialog.querySelector('header')?.getBoundingClientRect();
      const field = focused.getBoundingClientRect();
      const top =
        header && header.top >= bounds.top && header.bottom < bounds.bottom
          ? header.bottom
          : bounds.top;
      if (field.top < top || field.bottom > bounds.bottom)
        focused.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    };
    // Text resizing can move an already focused control without another focus or
    // viewport event. Observe its size as well as the modal's available space.
    const focusedSize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealFocusedControl);
    const revealFocus = () => {
      focusedSize?.disconnect();
      const focused = document.activeElement;
      const dialog = focused instanceof HTMLElement ? focused.closest('dialog[open]') : null;
      if (dialog && focused instanceof HTMLElement) {
        focusedSize?.observe(focused);
        focusedSize?.observe(dialog);
        const header = dialog.querySelector('header');
        if (header) focusedSize?.observe(header);
      }
      revealFocusedControl();
    };
    update();
    viewport?.addEventListener('resize', resized);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', resized);
    document.addEventListener('focusin', revealFocus);
    revealFocus();
    return () => {
      focusedSize?.disconnect();
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener('resize', resized);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', resized);
      document.removeEventListener('focusin', revealFocus);
    };
  }, []);
  return null;
}
