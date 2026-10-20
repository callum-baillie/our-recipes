'use client';
import { useState } from 'react';
import styles from './settings-merge-review.module.css';
import { mergeSettings, resolveSettingsMerge } from '@/lib/domain/settings-merge';

export function settingsFieldLabel(path: string[]) {
  return path
    .map((part) => {
      const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
      return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
    })
    .join(' · ');
}

function display(value: unknown) {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function SettingsMergeReview<T>({
  baseline,
  draft,
  current,
  pending,
  onResolve,
  onDiscard,
  label = settingsFieldLabel,
}: {
  baseline: T;
  draft: T;
  current: T;
  pending: boolean;
  onResolve: (value: T) => void;
  onDiscard: () => void;
  label?: (path: string[]) => string;
}) {
  const merged = mergeSettings(baseline, draft, current);
  const [choices, setChoices] = useState<Record<string, 'draft' | 'current'>>({});
  const complete = merged.conflicts.every((item) => choices[JSON.stringify(item.path)]);
  return (
    <section
      className={`settings-local-status ${styles.review}`}
      aria-label="Compare concurrent changes"
    >
      <p>
        Changes to different fields are combined. Choose which value to keep where both versions
        changed the same field. Nothing is saved until you save the reviewed draft.
      </p>
      {merged.refreshed.length > 0 && (
        <p>Updated from saved settings: {merged.refreshed.map(label).join(', ')}.</p>
      )}
      {merged.retained.length > 0 && (
        <p>Your edits retained: {merged.retained.map(label).join(', ')}.</p>
      )}
      {merged.conflicts.map((item) => {
        const key = JSON.stringify(item.path);
        return (
          <fieldset key={key} disabled={pending}>
            <legend>{label(item.path)}</legend>
            <p>Previously saved: {display(item.baseline)}</p>
            <label>
              <input
                type="radio"
                name={`merge-${key}`}
                checked={choices[key] === 'draft'}
                onChange={() => setChoices((previous) => ({ ...previous, [key]: 'draft' }))}
              />
              Keep my edit: {display(item.draft)}
            </label>
            <label>
              <input
                type="radio"
                name={`merge-${key}`}
                checked={choices[key] === 'current'}
                onChange={() => setChoices((previous) => ({ ...previous, [key]: 'current' }))}
              />
              Use current saved value: {display(item.current)}
            </label>
          </fieldset>
        );
      })}
      <div className="button-row">
        <button
          type="button"
          className="secondary-button"
          disabled={pending || !complete}
          onClick={() => onResolve(resolveSettingsMerge(merged, choices))}
        >
          Use reviewed draft
        </button>
        <button type="button" className="text-button" disabled={pending} onClick={onDiscard}>
          Discard my edits and use saved settings
        </button>
      </div>
    </section>
  );
}
