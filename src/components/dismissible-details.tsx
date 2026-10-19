'use client';

import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';

type DismissibleDetailsProps = {
  className: string;
  summary: ReactNode;
  summaryAriaLabel?: string;
  expandedSummaryAriaLabel?: string;
  expandedSummary?: ReactNode;
  summaryRef?: Ref<HTMLElement>;
  children: ReactNode;
  viewportPanel?: boolean;
  detailsRef?: RefObject<HTMLDetailsElement | null>;
};

export function DismissibleDetails({
  className,
  summary,
  summaryAriaLabel,
  expandedSummaryAriaLabel,
  expandedSummary,
  summaryRef,
  children,
  viewportPanel = false,
  detailsRef: externalDetailsRef,
}: DismissibleDetailsProps) {
  const [open, setOpen] = useState(false);
  const internalDetailsRef = useRef<HTMLDetailsElement>(null);
  const detailsRef = externalDetailsRef ?? internalDetailsRef;

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
  }, [detailsRef]);

  useEffect(() => {
    if (!open || !viewportPanel) return;
    const details = detailsRef.current;
    const panel = details?.querySelector<HTMLElement>(':scope > div');
    const summary = details?.querySelector('summary');
    if (!panel || !summary) return;
    const place = () => {
      const anchor = summary.getBoundingClientRect();
      const gutter = 16;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      panel.style.position = 'fixed';
      panel.style.width = `${Math.min(288, window.innerWidth - gutter * 2)}px`;
      panel.style.maxHeight = `${viewportHeight - gutter * 2}px`;
      panel.style.overflowY = 'auto';
      const height = panel.getBoundingClientRect().height;
      panel.style.left = `${Math.max(gutter, Math.min(anchor.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - gutter))}px`;
      panel.style.right = 'auto';
      panel.style.top = `${Math.max(viewportTop + gutter, Math.min(anchor.bottom + 6, viewportTop + viewportHeight - height - gutter))}px`;
      panel.style.bottom = 'auto';
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [detailsRef, open, viewportPanel]);

  return (
    <details
      className={className}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      ref={detailsRef}
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        if (!event.target.closest('a[href], [data-menu-close]')) return;
        const details = detailsRef.current;
        if (details) {
          details.open = false;
          details.querySelector('summary')?.focus({ preventScroll: true });
        }
      }}
    >
      <summary
        aria-expanded={open}
        aria-label={open ? (expandedSummaryAriaLabel ?? summaryAriaLabel) : summaryAriaLabel}
        ref={summaryRef}
      >
        {open ? (expandedSummary ?? summary) : summary}
      </summary>
      {children}
    </details>
  );
}
