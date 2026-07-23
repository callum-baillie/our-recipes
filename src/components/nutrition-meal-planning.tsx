'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import styles from '@/components/nutrition-meal-planning.module.css';
import { NutritionVisualMarker } from '@/components/nutrition-visual-marker';

export type NutritionMealProjectionView = {
  range: { start: string; end: string };
  meals: Array<{
    mealPlanEntryId: string;
    plannedFor: string;
    meal: string;
    title: string;
    recipeId: string | null;
    totalServings: number;
    assignedServings: number;
    unassignedServings: number;
    overallocatedServings: number;
    ownAllocations: Array<{
      id: string;
      seriesId: string;
      revision: number;
      state: 'planned' | 'served' | 'eaten' | 'skipped' | 'leftover';
      servings: number | null;
      note: string;
    }>;
    plannedServings: number;
    calculationStatus: 'current' | 'stale' | 'unavailable';
    calculationId: string | null;
    confidence: number | null;
    completeness: number | null;
    warnings: string[];
    plannedValues: Record<string, number> | null;
  }>;
  totalsByDate: Record<string, Record<string, number>>;
  confirmedTotalsByDate?: Record<string, Record<string, number>>;
};

type Allocation = NutritionMealProjectionView['meals'][number]['ownAllocations'][number];

function amount(value: number | undefined, digits = 1) {
  return value === undefined
    ? 'Unknown'
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function NutritionMealPlanning({
  activeProfileId,
  canManageProfile,
  showNutritionPreview = true,
  today,
  consumedToday,
  projection,
}: {
  activeProfileId: string;
  canManageProfile: boolean;
  showNutritionPreview?: boolean;
  today: string;
  consumedToday: Record<string, number>;
  projection: NutritionMealProjectionView;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [preparedIds, setPreparedIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(projection.meals.map((meal) => [meal.mealPlanEntryId, crypto.randomUUID()])),
  );
  const plannedToday = projection.totalsByDate[today] ?? {};

  async function saveAllocation(
    event: FormEvent<HTMLFormElement>,
    mealPlanEntryId: string,
    current: Allocation | null,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus('Saving planned portion…');
    const response = await fetch(`/api/v1/nutrition/profiles/${activeProfileId}/allocations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seriesId: current?.seriesId,
        supersedesAllocationVersionId: current?.id ?? null,
        mealPlanEntryId,
        cookSessionId: null,
        state: data.get('state'),
        servings: Number(data.get('servings')),
        portionWeightGrams: null,
        intakeSeriesId: null,
        note: data.get('note'),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setStatus(body?.error?.message ?? 'The planned portion could not be saved.');
      return;
    }
    setStatus('Planned portion saved. Nothing was recorded as eaten.');
    router.refresh();
  }

  async function recordPreparedBatch(
    event: FormEvent<HTMLFormElement>,
    meal: NutritionMealProjectionView['meals'][number],
  ) {
    event.preventDefault();
    if (!meal.calculationId) return;
    const data = new FormData(event.currentTarget);
    const preparedInstanceId = preparedIds[meal.mealPlanEntryId] ?? crypto.randomUUID();
    const finalWeight = String(data.get('finalWeightGrams') ?? '').trim();
    setStatus('Saving prepared batch…');
    const response = await fetch(`/api/v1/nutrition/profiles/${activeProfileId}/prepared-recipes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preparedInstanceId,
        recipeCalculationId: meal.calculationId,
        mealPlanEntryId: meal.mealPlanEntryId,
        cookSessionId: null,
        actualServings: Number(data.get('actualServings')),
        finalWeightGrams: finalWeight ? Number(finalWeight) : null,
        preparationMatchesCalculation: data.get('preparationMatchesCalculation') === 'yes',
        note: data.get('note'),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setStatus(body?.error?.message ?? 'The prepared batch could not be saved.');
      return;
    }
    setPreparedIds((current) => ({
      ...current,
      [meal.mealPlanEntryId]: crypto.randomUUID(),
    }));
    setStatus('Prepared batch saved. No food was recorded as eaten.');
    router.refresh();
  }

  return (
    <section className={styles.panel} aria-labelledby="planned-nutrition-heading">
      <header className={styles.heading}>
        <div>
          <h2 id="planned-nutrition-heading">Planned nutrition and portions</h2>
          <p>
            Portions are explicit and may be fractional. Planning or serving never records food as
            eaten.
          </p>
        </div>
        <span>
          {projection.range.start} to {projection.range.end}
        </span>
      </header>

      {showNutritionPreview ? (
        <div className={styles.comparison} aria-label={`${today} planned and consumed comparison`}>
          {[
            ['Calories', 'energy_kcal', 'kcal'],
            ['Protein', 'protein', 'g'],
            ['Carbohydrate', 'carbohydrate', 'g'],
            ['Fat', 'total_fat', 'g'],
          ].map(([label, code, unit]) => (
            <article key={code}>
              <strong>{label}</strong>
              <span>
                Planned: {amount(plannedToday[code])} {unit}
              </span>
              <span>
                Consumed: {amount(consumedToday[code])} {unit}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          Nutrition metric previews are hidden by this profile&apos;s display preference.
        </p>
      )}

      {projection.meals.length === 0 ? (
        <p className={styles.empty}>No meals are planned in this date range.</p>
      ) : (
        <ol className={styles.meals}>
          {projection.meals.map((meal) => (
            <li key={meal.mealPlanEntryId}>
              <header>
                <div>
                  <span>
                    {meal.plannedFor} · {meal.meal}
                  </span>
                  <h3>{meal.title}</h3>
                </div>
                <dl>
                  <div>
                    <dt>Total</dt>
                    <dd>{meal.totalServings}</dd>
                  </div>
                  <div>
                    <dt>Assigned</dt>
                    <dd>{meal.assignedServings}</dd>
                  </div>
                  <div>
                    <dt>Unassigned</dt>
                    <dd>{meal.unassignedServings}</dd>
                  </div>
                </dl>
              </header>
              {meal.overallocatedServings > 0 ? (
                <p className={styles.warning}>
                  Existing history is over-allocated by {meal.overallocatedServings} servings.
                  Reduce a current allocation before adding another.
                </p>
              ) : null}
              <p className={styles.quality}>
                Calculation: {meal.calculationStatus}
                {meal.completeness === null
                  ? ''
                  : ` · ${Math.round(meal.completeness * 100)}% complete`}
                {meal.confidence === null
                  ? ''
                  : ` · ${Math.round(meal.confidence * 100)}% confidence`}
              </p>
              {showNutritionPreview && meal.plannedValues ? (
                <div className={styles.nutrients}>
                  <strong>This profile: {meal.plannedServings} planned servings</strong>
                  <span>
                    <NutritionVisualMarker nutrientCode="energy_kcal" compact />
                    {amount(meal.plannedValues.energy_kcal, 0)} kcal
                  </span>
                  <span>
                    <NutritionVisualMarker nutrientCode="protein" compact />
                    {amount(meal.plannedValues.protein)} g protein
                  </span>
                </div>
              ) : showNutritionPreview && meal.plannedServings > 0 ? (
                <p className={styles.warning}>
                  Planned portions are saved, but current normalized nutrient evidence is
                  unavailable. Missing values are not zero.
                </p>
              ) : null}
              <details className={styles.allocationTools}>
                <summary>Manage portions and prepared batches</summary>
                <div className={styles.allocations}>
                  {meal.ownAllocations.map((allocation) => (
                    <form
                      key={allocation.seriesId}
                      onSubmit={(event) =>
                        void saveAllocation(event, meal.mealPlanEntryId, allocation)
                      }
                    >
                      <strong>My portion · revision {allocation.revision}</strong>
                      <label>
                        Status
                        <select name="state" defaultValue={allocation.state}>
                          <option value="planned">Planned</option>
                          <option value="served">Served, not yet eaten</option>
                          <option value="skipped">Skipped</option>
                          <option value="leftover">Leftover, not eaten</option>
                        </select>
                      </label>
                      <label>
                        Servings
                        <input
                          name="servings"
                          type="number"
                          min="0.000001"
                          max="1000000"
                          step="any"
                          defaultValue={allocation.servings ?? 1}
                          required
                        />
                      </label>
                      <label>
                        Note
                        <input name="note" maxLength={500} defaultValue={allocation.note} />
                      </label>
                      <button type="submit" disabled={!canManageProfile}>
                        Save revision
                      </button>
                    </form>
                  ))}
                  {meal.unassignedServings > 0 ? (
                    <form
                      onSubmit={(event) => void saveAllocation(event, meal.mealPlanEntryId, null)}
                    >
                      <strong>Assign another portion</strong>
                      <label>
                        Status
                        <select name="state" defaultValue="planned">
                          <option value="planned">Planned</option>
                          <option value="served">Served, not yet eaten</option>
                          <option value="skipped">Skipped</option>
                          <option value="leftover">Leftover, not eaten</option>
                        </select>
                      </label>
                      <label>
                        Servings
                        <input
                          name="servings"
                          type="number"
                          min="0.000001"
                          max={meal.unassignedServings}
                          step="any"
                          defaultValue={Math.min(1, meal.unassignedServings)}
                          required
                        />
                      </label>
                      <label>
                        Note
                        <input name="note" maxLength={500} />
                      </label>
                      <button type="submit" disabled={!canManageProfile}>
                        Assign portion
                      </button>
                    </form>
                  ) : null}
                  {meal.calculationStatus === 'current' && meal.calculationId ? (
                    <form onSubmit={(event) => void recordPreparedBatch(event, meal)}>
                      <strong>Record a prepared batch</strong>
                      <p className={styles.formHint}>
                        Use the actual yield after cooking. This does not record consumption.
                      </p>
                      <label>
                        Actual servings prepared
                        <input
                          name="actualServings"
                          type="number"
                          min="0.000001"
                          max="1000000"
                          step="any"
                          defaultValue={meal.totalServings}
                          required
                        />
                      </label>
                      <label>
                        Final cooked weight in grams, if used in the calculation
                        <input
                          name="finalWeightGrams"
                          type="number"
                          min="0.000001"
                          max="1000000"
                          step="any"
                        />
                      </label>
                      <label>
                        <input
                          name="preparationMatchesCalculation"
                          type="checkbox"
                          value="yes"
                          required
                        />{' '}
                        The ingredients, optional items, substitutions, exclusions, drained or
                        edible portions, and final weight match this calculation.
                      </label>
                      <p className={styles.formHint}>
                        If anything changed while cooking, recalculate Nutrition first. The prepared
                        batch freezes that calculation and cannot be replaced later.
                      </p>
                      <label>
                        Preparation note
                        <input name="note" maxLength={1000} />
                      </label>
                      <button type="submit" disabled={!canManageProfile}>
                        Save prepared batch
                      </button>
                    </form>
                  ) : null}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
