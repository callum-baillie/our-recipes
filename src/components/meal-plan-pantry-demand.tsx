'use client';

import { ToastNotice } from './toast-provider';

import { ToastMessage } from './toast-message';

import { useEffect, useState } from 'react';

import { LoadingIndicator } from '@/components/skeleton';
import type { PantryProjectedDemand } from '@/lib/domain/pantry-availability';

import styles from './meal-plan-pantry-demand.module.css';

function amount(value: number, unit: string): string {
  return `${Number(value.toFixed(2))} ${unit}`.trim();
}

export function MealPlanPantryDemand({ demand }: { demand: PantryProjectedDemand }) {
  const [mounted, setMounted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [mode, setMode] = useState<'missing' | 'all'>('missing');
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/v1/shopping-lists/pantry-shortages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: demand.weekStart,
          weekEnd: demand.weekEnd,
          mode,
          ...(listId ? { listId } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        listId?: string;
        restored?: boolean;
        error?: { message?: string };
      } | null;
      if (response.ok && body?.listId) {
        setListId(body.listId);
        setRestored(Boolean(body.restored));
      } else setError(body?.error?.message ?? 'The Pantry shortage list could not be generated.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The Pantry shortage list could not be generated.',
      );
    } finally {
      setGenerating(false);
    }
  };
  return (
    <section className={styles.panel} aria-labelledby="pantry-demand-title">
      <header>
        <p>PROJECTED PANTRY DEMAND</p>
        <h2 id="pantry-demand-title">Across this whole week</h2>
        <span>No stock is reserved or consumed by this preview.</span>
      </header>
      {demand.lines.length ? (
        <ul className={styles.lines}>
          {demand.lines.map((line) => (
            <li
              key={`${line.productId}-${line.unit}`}
              className={line.state === 'uncertain' ? styles.uncertainLine : undefined}
            >
              <strong>{line.productName}</strong>
              <span>
                Need {amount(line.requiredQuantity, line.unit)} · exact compatible stock{' '}
                {amount(line.availableQuantity, line.unit)}
                {line.state === 'covered'
                  ? ' · covered'
                  : line.state === 'shortage'
                    ? ` · short ${amount(line.shortageQuantity!, line.unit)}`
                    : ' · exact shortage uncertain'}
              </span>
              {line.uncertaintyReason && <em>{line.uncertaintyReason}</em>}
              <span>
                Projected remainder{' '}
                {line.projectedRemainderQuantity === null
                  ? 'unknown'
                  : amount(line.projectedRemainderQuantity, line.unit)}
                {line.exhaustionDate ? ` · exact stock runs short by ${line.exhaustionDate}` : ''}
                {line.earliestExpiryDate
                  ? ` · earliest recorded batch date ${line.earliestExpiryDate}`
                  : ''}
              </span>
              {line.expiryConflicts.length > 0 && (
                <em>
                  Recorded batch dates precede {line.expiryConflicts.length}{' '}
                  {line.expiryConflicts.length === 1 ? 'planned use' : 'planned uses'}; review those
                  batches before the meal. This is planning context, not food-safety advice.
                </em>
              )}
              <small>
                {line.meals.map((meal) => `${meal.plannedFor} ${meal.recipeTitle}`).join(' · ')}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No exact mapped demand can be calculated for this week yet.</p>
      )}
      {demand.unknown.length > 0 && (
        <details>
          <summary>{demand.unknown.length} ingredient demands remain unknown</summary>
          <ul className={styles.unknown}>
            {demand.unknown.map((item) => (
              <li key={`${item.mealPlanEntryId}-${item.ingredientId}`}>
                <strong>{item.ingredientName}</strong> for {item.recipeTitle}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className={styles.actions}>
        <label aria-busy={generating}>
          Grocery view
          <select
            value={mode}
            disabled={generating}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="missing">Missing items only</option>
            <option value="all">All demand, including covered</option>
          </select>
        </label>
        <button
          type="button"
          aria-busy={generating}
          aria-label={
            !generating && !listId && mode === 'missing'
              ? 'Make shortage list · Make missing-items list'
              : undefined
          }
          disabled={!mounted || generating}
          onClick={() => void generate()}
        >
          {generating ? (
            <>
              <LoadingIndicator label="Calculating grocery list" /> Calculating…
            </>
          ) : listId ? (
            'Regenerate without losing edits'
          ) : mode === 'missing' ? (
            'Make missing-items list'
          ) : (
            'Make all-items list'
          )}
        </button>
        {listId && (
          <a href={`/lists/${listId}${restored ? '?restored=1' : ''}`}>Open grocery list</a>
        )}
        {restored ? (
          <ToastNotice>Archived list restored with your edits intact.</ToastNotice>
        ) : null}
        {error && <ToastMessage message={error} tone="error" />}
      </div>
    </section>
  );
}
