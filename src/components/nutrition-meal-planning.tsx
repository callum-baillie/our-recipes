'use client';
import { useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { createClientUuid } from '@/lib/client/client-uuid';
import { useNutritionRequest } from './use-nutrition-request';
import { NutritionFeedback } from './nutrition-form-fields';
import formStyles from './nutrition-dashboard.module.css';
import styles from './nutrition-meal-planning.module.css';
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

type Meal = NutritionMealProjectionView['meals'][number];
type Allocation = Meal['ownAllocations'][number];
export function NutritionMealPlanning({
  activeProfileId,
  activeProfileName = 'This person',
  canManageProfile,
  showNutritionPreview = true,
  today,
  consumedToday,
  projection,
  embedded = false,
}: {
  activeProfileId: string;
  activeProfileName?: string;
  canManageProfile: boolean;
  showNutritionPreview?: boolean;
  today: string;
  consumedToday: Record<string, number>;
  projection: NutritionMealProjectionView;
  embedded?: boolean;
}) {
  return (
    <section
      className={embedded ? styles.embedded : styles.panel}
      aria-label="Planned portion management"
    >
      {!embedded && (
        <header>
          <h2>Planned meals and personal portions</h2>
          <p>
            {activeProfileName} · meals from {projection.range.start} to {projection.range.end}.
            Assigning or serving food does not establish consumption.
          </p>
        </header>
      )}
      {showNutritionPreview && (
        <div
          className={styles.comparison}
          aria-label={`${activeProfileName} · ${today} planned and consumed comparison`}
        >
          {[
            ['Calories', 'energy_kcal', 'kcal'],
            ['Protein', 'protein', 'g'],
            ['Carbohydrate', 'carbohydrate', 'g'],
            ['Fat', 'total_fat', 'g'],
          ].map(([label, code, unit]) => (
            <div key={code}>
              <strong>
                {label} · {today}
              </strong>
              <span>
                Planned: {projection.totalsByDate[today]?.[code!]?.toLocaleString() ?? 'Unknown'}{' '}
                {unit}
              </span>
              <span>
                Consumed: {consumedToday[code!]?.toLocaleString() ?? 'Unknown'} {unit}
              </span>
            </div>
          ))}
        </div>
      )}
      {!projection.meals.length ? (
        <p className={styles.empty}>
          No meals in this range.{' '}
          <Link className="inline-link" href="/planner">
            Open meal planner
          </Link>
        </p>
      ) : (
        <ol className={styles.meals}>
          {projection.meals.map((meal) => (
            <PlannedMealPortions
              key={`${activeProfileId}:${meal.mealPlanEntryId}`}
              meal={meal}
              profileId={activeProfileId}
              profileName={activeProfileName}
              canManage={canManageProfile}
              showNutrition={showNutritionPreview}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
function PlannedMealPortions({
  meal,
  profileId,
  profileName,
  canManage,
  showNutrition,
}: {
  meal: Meal;
  profileId: string;
  profileName: string;
  canManage: boolean;
  showNutrition: boolean;
}) {
  const router = useRouter();
  const request = useNutritionRequest(`${profileId}:planned:${meal.mealPlanEntryId}`);
  const preparedId = useRef(createClientUuid());
  const reviewHref = `/nutrition?view=diary&task=calculate&recipe=${meal.recipeId ?? ''}#nutrition-data-tools`;
  async function save(event: FormEvent<HTMLFormElement>, allocation: Allocation | null) {
    event.preventDefault();
    if (!canManage || request.isPending()) return;
    const data = new FormData(event.currentTarget);
    const task = allocation?.seriesId ?? 'new';
    const result = await request.send(task, `/api/v1/nutrition/profiles/${profileId}/allocations`, {
      seriesId: allocation?.seriesId,
      supersedesAllocationVersionId: allocation?.id ?? null,
      mealPlanEntryId: meal.mealPlanEntryId,
      cookSessionId: null,
      state: data.get('state'),
      servings: Number(data.get('servings')),
      portionWeightGrams: null,
      intakeSeriesId: null,
      note: data.get('note'),
    });
    if (result) {
      request.message(
        task,
        'success',
        `Personal portion saved for ${profileName}. No food was recorded as eaten.`,
      );
      router.refresh();
    }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || request.isPending() || !meal.calculationId) return;
    const data = new FormData(event.currentTarget);
    const final = String(data.get('finalWeightGrams') ?? '').trim();
    const result = await request.send(
      'prepare',
      `/api/v1/nutrition/profiles/${profileId}/prepared-recipes`,
      {
        preparedInstanceId: preparedId.current,
        recipeCalculationId: meal.calculationId,
        mealPlanEntryId: meal.mealPlanEntryId,
        cookSessionId: null,
        actualServings: Number(data.get('actualServings')),
        finalWeightGrams: final ? Number(final) : null,
        preparationMatchesCalculation: data.get('preparationMatchesCalculation') === 'yes',
        note: data.get('note'),
      },
      { replay: true, pending: 'Recording prepared batch…' },
    );
    if (result) {
      preparedId.current = createClientUuid();
      request.message(
        'prepare',
        'success',
        'Prepared batch recorded. Serving or saving leftovers does not log consumption.',
      );
      router.refresh();
    }
  }
  function portionForm(allocation: Allocation | null) {
    const task = allocation?.seriesId ?? 'new';
    return (
      <form key={allocation?.id ?? task} onSubmit={(event) => void save(event, allocation)}>
        <fieldset
          className={formStyles.formFields}
          disabled={request.pending || !canManage || request.isBlocked(task)}
        >
          <strong>
            {allocation
              ? `${profileName} · ${allocation.servings ?? 'Unknown'} servings · ${allocation.state}`
              : 'Assign another personal portion'}
          </strong>
          <label>
            Portion state
            <select name="state" defaultValue={allocation?.state ?? 'planned'}>
              <option value="planned">Planned</option>
              <option value="served">Served, not eaten</option>
              <option value="skipped">Skipped</option>
              <option value="leftover">Leftover, not eaten</option>
            </select>
          </label>
          <label>
            Personal servings
            <input
              name="servings"
              type="number"
              min="0.000001"
              max={allocation ? 1000000 : meal.unassignedServings}
              step="any"
              defaultValue={allocation?.servings ?? Math.min(1, meal.unassignedServings)}
              required
            />
          </label>
          <label>
            Note (optional)
            <input name="note" maxLength={500} defaultValue={allocation?.note ?? ''} />
          </label>
          <button type="submit">
            {request.busyTask === task
              ? 'Saving portion…'
              : allocation
                ? 'Save portion revision'
                : 'Assign portion'}
          </button>
        </fieldset>
        <NutritionFeedback value={request.feedback[task]} />
      </form>
    );
  }
  return (
    <li>
      <header>
        <div>
          <span>
            {meal.plannedFor} · {meal.meal}
          </span>
          <h3>{meal.title}</h3>
        </div>
        <p>
          Shared capacity: {meal.totalServings} servings · {meal.assignedServings} assigned across
          people · {meal.unassignedServings} unassigned
        </p>
      </header>
      <div className={styles.personal}>
        <strong>{profileName}’s saved portions</strong>
        {meal.ownAllocations.length ? (
          <ul>
            {meal.ownAllocations.map((allocation) => (
              <li key={allocation.id}>
                {allocation.servings ?? 'Unknown'} servings · {allocation.state}
                {allocation.state === 'eaten' ? ' · counted in diary, not editable here' : ''}
              </li>
            ))}
          </ul>
        ) : (
          <span>No personal portion assigned.</span>
        )}
      </div>
      {meal.overallocatedServings > 0 && (
        <p className={styles.warning}>
          Saved allocations exceed the shared capacity by {meal.overallocatedServings} servings.
          Correct an allocation before adding another.
        </p>
      )}
      <p className={styles.quality}>
        {meal.calculationStatus === 'current'
          ? 'Current recipe calculation'
          : meal.calculationStatus === 'stale'
            ? 'Recipe calculation needs review'
            : 'Nutrition calculation unavailable'}
        {meal.completeness === null ? '' : ` · ${Math.round(meal.completeness * 100)}% coverage`}.{' '}
        {meal.recipeId && (
          <Link className="inline-link" href={reviewHref}>
            Review recipe nutrition
          </Link>
        )}
      </p>
      {showNutrition && meal.plannedValues && (
        <p className={styles.quality}>
          Personal planned estimates: {meal.plannedValues.energy_kcal ?? 'Unknown'} kcal ·{' '}
          {meal.plannedValues.protein ?? 'Unknown'} g protein.
        </p>
      )}
      <details className={styles.allocationTools}>
        <summary className="recipe-disclosure-summary">
          Manage portions and prepared batches
          <ChevronDown size={18} />
        </summary>
        <div className={styles.allocations}>
          {meal.ownAllocations.map((allocation) =>
            allocation.state === 'eaten' ? (
              <div key={allocation.id}>
                <p>
                  This portion is recorded as consumed. Change it through diary correction history.
                </p>
                <Link className="inline-link" href="/nutrition?view=diary">
                  Find consumed entry in diary
                </Link>
              </div>
            ) : (
              portionForm(allocation)
            ),
          )}
          {meal.unassignedServings > 0 ? (
            portionForm(null)
          ) : (
            <NutritionFeedback value={request.feedback.new} />
          )}
        </div>
        {meal.calculationStatus === 'current' && meal.calculationId ? (
          <form onSubmit={(event) => void prepare(event)}>
            <fieldset className={formStyles.formFields} disabled={request.pending || !canManage}>
              <h4>Record a prepared batch</h4>
              <p className={formStyles.helper}>
                Use the actual yield after cooking. This freezes the reviewed calculation and does
                not record food as eaten.
              </p>
              <div className={formStyles.formGrid}>
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
                  Final cooked weight (g, if used)
                  <input
                    name="finalWeightGrams"
                    type="number"
                    min="0.000001"
                    max="1000000"
                    step="any"
                  />
                </label>
              </div>
              <label className={formStyles.checkRow}>
                <input name="preparationMatchesCalculation" type="checkbox" value="yes" required />
                Ingredients, optional items, substitutions, exclusions, edible/drained portions and
                final weight match this calculation.
              </label>
              <label>
                Preparation note (optional)
                <input name="note" maxLength={1000} />
              </label>
              <button type="submit">
                {request.busyTask === 'prepare' ? 'Recording batch…' : 'Save prepared batch'}
              </button>
            </fieldset>
            <NutritionFeedback value={request.feedback.prepare}>
              {request.feedback.prepare?.phase === 'success' && (
                <Link className="inline-link" href="/nutrition?view=diary#prepared-servings">
                  View prepared servings
                </Link>
              )}
            </NutritionFeedback>
          </form>
        ) : (
          <p className={styles.quality}>
            A current recipe calculation is required before recording a prepared batch.{' '}
            <Link className="inline-link" href={reviewHref}>
              Review recipe nutrition
            </Link>
            .
          </p>
        )}
        {!canManage && (
          <p className={styles.quality}>
            Portion changes are unavailable for this read-only profile.
          </p>
        )}
      </details>
    </li>
  );
}
