import type { KeyboardEvent } from 'react';

/** Roving focus and selection for existing button-based radio controls. */
export function radioKeys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
    return;
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
  );
  const index = options.indexOf(event.target as HTMLButtonElement);
  if (index < 0 || !options.length) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (index +
            (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
            options.length) %
          options.length;
  options[next]?.focus();
  options[next]?.click();
}
