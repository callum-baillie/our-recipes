'use client';
import { useId, useState, type ComponentPropsWithoutRef } from 'react';
/** Ephemeral reveal state; native password-manager, paste and autocomplete behavior remains intact. */
export function PasswordInput({
  label,
  hint,
  ...props
}: Omit<ComponentPropsWithoutRef<'input'>, 'type'> & { label: string; hint?: string }) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          {...props}
          id={id}
          type={revealed ? 'text' : 'password'}
          aria-describedby={
            [props['aria-describedby'], hint ? `${id}-hint` : ''].filter(Boolean).join(' ') ||
            undefined
          }
        />
        <button
          type="button"
          className="text-button"
          disabled={props.disabled}
          aria-label={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
