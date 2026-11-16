'use client';
import { Check, RefreshCw } from 'lucide-react';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import styles from './swipe-row.module.css';

const THRESHOLD = 72;
const MAX_PULL = 128;
const DEFAULT_IGNORE = 'a,button,input,select,textarea,summary,[data-no-swipe]';

/**
 * A row that can be dragged sideways like a card: right to accept, left to reject. The visible
 * buttons inside the row remain the primary, accessible way to act; swiping is a shortcut.
 * Vertical scrolling is left to the browser (`touch-action: pan-y`) and a drag only begins once the
 * pointer has clearly moved sideways, so links, buttons and scrolling are not hijacked.
 */
export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Keep',
  leftLabel = 'Change',
  disabled = false,
  ignore = DEFAULT_IGNORE,
  className = '',
  contentClassName = '',
  state,
}: {
  children?: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  /** Shown behind the row while dragging right. */
  rightLabel?: string;
  /** Shown behind the row while dragging left. */
  leftLabel?: string;
  disabled?: boolean;
  /** Elements (by selector) that never start a drag. */
  ignore?: string;
  className?: string;
  contentClassName?: string;
  state?: string;
}) {
  const track = useRef<{ id: number; x: number; y: number; locked: boolean } | null>(null);
  const latest = useRef(0);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pull = (value: number) => {
    // Resist a direction that has no action so the row does not suggest one.
    if ((value > 0 && !onSwipeRight) || (value < 0 && !onSwipeLeft)) return value * 0.12;
    return Math.sign(value) * Math.min(MAX_PULL, Math.abs(value) * 0.9);
  };

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = track.current;
    track.current = null;
    if (!current?.locked) return;
    event.currentTarget.releasePointerCapture?.(current.id);
    const final = latest.current;
    latest.current = 0;
    setDragging(false);
    setOffset(0);
    // The click that ends a drag must not also activate the control under the pointer.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 60);
    if (event.type === 'pointercancel') return;
    if (final >= THRESHOLD && onSwipeRight) onSwipeRight();
    else if (final <= -THRESHOLD && onSwipeLeft) onSwipeLeft();
  };

  const strength = Math.min(1, Math.abs(offset) / THRESHOLD);
  return (
    <div
      className={`${styles.row} ${className}`.trim()}
      data-state={state}
      data-side={offset > 0 ? 'right' : offset < 0 ? 'left' : undefined}
    >
      <div className={styles.hints} aria-hidden="true">
        <span className={styles.keep} style={{ opacity: offset > 0 ? strength : 0 }}>
          <Check /> {rightLabel}
        </span>
        <span className={styles.change} style={{ opacity: offset < 0 ? strength : 0 }}>
          {leftLabel} <RefreshCw />
        </span>
      </div>
      <div
        className={`${styles.content} ${contentClassName}`.trim()}
        data-dragging={dragging || undefined}
        data-armed={strength >= 1 ? (offset > 0 ? 'right' : 'left') : undefined}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={(event) => {
          if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
          if ((event.target as HTMLElement).closest(ignore)) return;
          track.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            locked: false,
          };
        }}
        onPointerMove={(event) => {
          const current = track.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.locked) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
              track.current = null;
              return;
            }
            if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
            current.locked = true;
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }
          latest.current = pull(dx);
          setOffset(latest.current);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
