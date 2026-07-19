'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type DismissibleDetailsProps = {
  className: string;
  summary: ReactNode;
  summaryAriaLabel?: string;
  children: ReactNode;
};

export function DismissibleDetails({
  className,
  summary,
  summaryAriaLabel,
  children,
}: DismissibleDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    details.dataset.dismissibleReady = 'true';

    function dismissOutside(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }

    function dismissWithKeyboard(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const details = detailsRef.current;
      if (!details?.open) return;
      details.open = false;
      details.querySelector('summary')?.focus();
    }

    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissWithKeyboard);
    return () => {
      delete details.dataset.dismissibleReady;
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissWithKeyboard);
    };
  }, []);

  return (
    <details
      className={className}
      ref={detailsRef}
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        if (!event.target.closest('a[href], [data-menu-close]')) return;
        const details = detailsRef.current;
        if (details) details.open = false;
      }}
    >
      <summary aria-label={summaryAriaLabel}>{summary}</summary>
      {children}
    </details>
  );
}
