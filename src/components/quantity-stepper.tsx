'use client';

import { Minus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { setBatchQuantity, type SavedBatch } from '@/lib/client/pantry-batch';
import styles from './quantity-stepper.module.css';

const amount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

/** Whole units for things you count, a sensible bite for things you weigh or pour. */
export function stepFor(unit: string) {
  if (unit === 'g' || unit === 'ml') return 50;
  if (unit === 'kg' || unit === 'l' || unit === 'lb' || unit === 'gallon') return 0.5;
  return 1;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function QuantityStepper({
  value,
  unit,
  step = stepFor(unit),
  min = 0,
  max = 10000,
  label,
  busy = false,
  disabled = false,
  compact = false,
  editable = false,
  onChange,
}: {
  value: number;
  unit: string;
  step?: number;
  min?: number;
  max?: number;
  /** What this stepper changes, for assistive technology: "Beans". */
  label: string;
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** Let the number be typed, for amounts where whole steps are clumsy. */
  editable?: boolean;
  onChange: (next: number) => void;
}) {
  const unitLabel = unit ? ` ${unit}` : '';
  return (
    <div
      className={styles.stepper}
      data-compact={compact || undefined}
      data-busy={busy || undefined}
    >
      <button
        type="button"
        aria-label={`Remove ${amount.format(step)}${unitLabel} of ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(round(Math.max(min, value - step)))}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      {editable ? (
        <label className={styles.typed}>
          <span className="visually-hidden">{label} amount</span>
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step="any"
            value={Number.isFinite(value) ? value : ''}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : min);
            }}
          />
          <small>{unit}</small>
        </label>
      ) : (
        <output aria-live="polite" aria-label={`${label} amount`}>
          <strong key={value}>{amount.format(value)}</strong>
          <small>{unit}</small>
        </output>
      )}
      <button
        type="button"
        aria-label={`Add ${amount.format(step)}${unitLabel} of ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(round(Math.min(max, value + step)))}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Stepper that edits a saved batch. Taps show instantly and are sent once the taps pause, so
 * tapping five times is one save, not five competing version checks.
 */
export function BatchStepper({
  batch,
  step,
  label,
  disabled,
  compact,
  onSaved,
  onError,
}: {
  batch: { id: string; version: number; quantity: number; unit: string };
  step?: number;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  /** Resolve once the new value is visible in the list again. */
  onSaved: (batch: SavedBatch | undefined, quantity: number) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [shown, setShown] = useState<number | null>(null);
  const latest = useRef(batch.quantity);
  const version = useRef(batch.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = useRef(false);
  // Props can move on (a reload, a scan) only while nothing of ours is in flight.
  if (shown === null) {
    latest.current = batch.quantity;
    version.current = batch.version;
  }

  async function flush() {
    if (sending.current) return;
    sending.current = true;
    const sent = latest.current;
    try {
      const result = await setBatchQuantity(
        { id: batch.id, version: version.current, unit: batch.unit },
        sent,
      );
      if (result.batch) version.current = result.batch.version;
      await onSaved(result.batch, sent);
    } catch (error) {
      latest.current = batch.quantity;
      onError(error instanceof Error ? error.message : 'That change could not be saved.');
      setShown(null);
      sending.current = false;
      return;
    }
    sending.current = false;
    if (latest.current !== sent) void flush();
    else if (!timer.current) setShown(null);
  }

  function change(next: number) {
    latest.current = next;
    setShown(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, 450);
  }

  return (
    <QuantityStepper
      value={shown ?? batch.quantity}
      unit={batch.unit}
      step={step}
      label={label}
      busy={shown !== null}
      disabled={disabled}
      compact={compact}
      onChange={change}
    />
  );
}
