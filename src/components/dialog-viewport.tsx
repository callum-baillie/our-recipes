'use client';
import { useEffect } from 'react';
/** Keep native modal bounds inside the visible viewport when mobile keyboards open. */
export function DialogViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
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
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return null;
}
