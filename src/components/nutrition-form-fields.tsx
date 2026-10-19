'use client';

import { useId, type ReactNode } from 'react';
import {
  NUTRITION_MEALS,
  nutritionEventCandidates,
  nutritionWallTime,
} from '@/lib/domain/nutrition-ui';
import type { NutritionTaskFeedback } from './use-nutrition-request';
import styles from './nutrition-dashboard.module.css';

export function NutritionFeedback({
  value,
  children,
}: {
  value?: NutritionTaskFeedback;
  children?: ReactNode;
}) {
  if (!value?.message) return <span className="sr-only" role="status" aria-live="polite" />;
  return (
    <div
      className={styles.feedback}
      data-state={value.phase}
      role={value.phase === 'error' || value.phase === 'uncertain' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <p>{value.message}</p>
      {children}
    </div>
  );
}

export function NutritionEventFields({
  draft,
  update,
  timeZone,
  today,
  measurement = false,
}: {
  draft: { date: string; time: string; occurrence: string; mealSlot?: string };
  update: (
    patch: Partial<{ date: string; time: string; occurrence: string; mealSlot: string }>,
  ) => void;
  timeZone: string;
  today: string;
  measurement?: boolean;
}) {
  const id = useId();
  const ambiguous = nutritionEventCandidates(`${draft.date}T${draft.time}`, timeZone).length > 1;
  return (
    <fieldset className={styles.eventFields} aria-describedby={`${id}-zone`}>
      <legend>{measurement ? 'Observation time' : 'When eaten or recorded'}</legend>
      <div className={styles.formGrid}>
        <label className={styles.eventDate}>
          Date
          <input
            type="date"
            name="eventDate"
            max={today}
            value={draft.date}
            onChange={(event) => update({ date: event.target.value, occurrence: '' })}
            required
          />
        </label>
        <label>
          Time
          <input
            type="time"
            name="eventTime"
            value={draft.time}
            onChange={(event) => update({ time: event.target.value, occurrence: '' })}
            required
          />
        </label>
        {!measurement && (
          <label>
            Meal
            <select
              name="mealSlot"
              value={draft.mealSlot ?? 'snack'}
              onChange={(event) => update({ mealSlot: event.target.value })}
            >
              {NUTRITION_MEALS.map((meal) => (
                <option key={meal} value={meal}>
                  {meal.charAt(0).toUpperCase() + meal.slice(1)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p id={`${id}-zone`} className={styles.helper}>
        Times use {timeZone}, including the diary date.
      </p>
      {draft.date === today && (
        <button
          type="button"
          className={styles.textButton}
          onClick={() => {
            const local = nutritionWallTime(new Date(), timeZone);
            update({ date: local.slice(0, 10), time: local.slice(11), occurrence: '' });
          }}
        >
          Use current time
        </button>
      )}
      {ambiguous && (
        <label>
          Clock change
          <select
            value={draft.occurrence}
            onChange={(event) => update({ occurrence: event.target.value })}
            required
          >
            <option value="">Choose which occurrence</option>
            <option value="earlier">Earlier occurrence</option>
            <option value="later">Later occurrence</option>
          </select>
          <small>This local time occurs twice when clocks move back.</small>
        </label>
      )}
    </fieldset>
  );
}
