'use client';
import { formatRecipeDuration } from '@/lib/domain/recipe-duration';
import {
  plannerFocus,
  shiftPlannerFocus,
  planningRangeError,
  nextMealDate,
  plannerMealOptions,
} from '@/lib/domain/planner-workflow';
import { DismissibleDetails } from './dismissible-details';
import { useEffect, useRef } from 'react';
import { AppDialog } from './app-dialog';
import cardStyles from './meal-planner-card.module.css';
import settingsStyles from './meal-plan-settings.module.css';
import { MealEntryEditor } from '@/components/meal-entry-editor';
import { parseMealPlanIngredientSnapshot } from '@/lib/domain/meal-plan-snapshot';
import type { MealPlanEntryInput } from '@/lib/domain/planning';
import { PageHeader } from '@/components/page-header';
import { DecisionAssistance } from '@/components/decision-assistance';

import { KitchenPrintDialog } from '@/components/kitchen-print-dialog';

import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  Clock3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Copy,
  CopyPlus,
  Ellipsis,
  Move,
  Plus,
  Redo2,
  Salad,
  Save,
  ShoppingBasket,
  Trash2,
  Undo2,
  Coffee,
  Sandwich,
  Soup,
  CakeSlice,
  Apple,
  Sunrise,
  Moon,
  UtensilsCrossed,
  type LucideIcon,
  UsersRound,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { AiMealPlanGenerator } from '@/components/ai-meal-plan-generator';
import { AiSummaryCards, type AiSummaryCardData } from '@/components/ai-summary-cards';
import { MealPlanRecipeSelector } from '@/components/meal-plan-recipe-selector';
import { ButtonSpinner, InlineSkeleton, LoadingIndicator } from '@/components/skeleton';
import {
  addPlannerDays,
  formatPlannerDate,
  mealTypeLabel,
  plannerDates,
  type MealType,
  type MealTypeOption,
} from '@/components/meal-planner-types';
import styles from '@/components/meal-planner.module.css';
import {
  DEFAULT_MEAL_PLAN_PREFERENCES,
  type MealPlanPreferences,
} from '@/lib/domain/app-preferences';
import type { PlannedMeal } from '@/lib/services/planning-service';
import type { RecipeListItem } from '@/lib/services/recipe-service';
import type { MealPlanOptionInput } from '@/lib/domain/planning';

type MealPlannerProps = {
  weekStart: string;
  weekEnd: string;
  meals: PlannedMeal[];
  recipes: RecipeListItem[];
  profiles: Array<{ id: string; displayName: string; nutritionReady?: boolean }>;
  collections: Array<{ id: string; name: string }>;
  collectionMemberships: Array<{ collectionId: string; recipeId: string }>;
  previousWeekStart: string;
  nextWeekStart: string;
  today?: string;
  focusDate?: string;
  nutritionProfileName?: string;
  nutritionByDate?: Record<string, Record<string, number>>;
  nutritionGoals?: Array<{
    nutrientCode: string;
    kind: 'target' | 'minimum' | 'range' | 'limit';
    value: number | null;
    minimum: number | null;
    maximum: number | null;
  }>;
  pantrySummary?: {
    covered: number;
    total: number;
    missing: number;
    short?: number;
    uncertain?: number;
  };
  pantryStatusByMeal?: Record<string, 'covered' | 'shortage' | 'uncertain' | 'unknown'>;
  defaultDuration?: 3 | 5 | 7 | 14;
  defaultMealTypes?: MealType[];
  mealPlanPreferences?: MealPlanPreferences;
  viewMode?: 'day' | 'week' | 'month';
  weekStartsOn?: 0 | 1;
  aiMealPlanModel?: string;
  aiImageGenerationEnabled?: boolean;
  initialAiSummary?: AiSummaryCardData | null;
};

type MealEntrySnapshot = Pick<
  MealPlanEntryInput,
  'kind' | 'options' | 'profileIds' | 'leftoverSourceId' | 'foodItem' | 'recipeOverride'
> & {
  plannedFor: string;
  meal: string;
  recipeId: string;
  title: string;
  servings: number;
  note: string;
};

type MealHistoryCommand =
  | {
      kind: 'added';
      label: string;
      entries: MealEntrySnapshot[];
      ids: string[];
    }
  | {
      kind: 'removed';
      label: string;
      entries: MealEntrySnapshot[];
      ids: string[];
    }
  | {
      kind: 'updated';
      label: string;
      id: string;
      before: MealEntrySnapshot;
      after: MealEntrySnapshot;
      currentUpdatedAt: string;
    }
  | {
      kind: 'status';
      label: string;
      id: string;
      before: PlannedMeal['status'];
      after: PlannedMeal['status'];
    }
  | {
      kind: 'swapped';
      label: string;
      sourceId: string;
      targetId: string;
      sourceUpdatedAt: string;
      targetUpdatedAt: string;
    };

function profileInitial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase() || '?';
}

const mealIcons: Record<string, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sandwich,
  dinner: Soup,
  dessert: CakeSlice,
  snack: Apple,
  brunch: Sunrise,
  supper: Soup,
  tiffin: Sandwich,
  suhoor: Sunrise,
  iftar: Moon,
};
function MealTypeIcon({ meal }: { meal: string }) {
  const Icon = mealIcons[meal] ?? UtensilsCrossed;
  return <Icon size={18} aria-hidden="true" />;
}

function mealLabel(meal: string): string {
  return mealTypeLabel(meal);
}

function humanRange(start: string, end: string): string {
  if (!start || !end) return 'Choose planning dates';
  const startLabel = formatPlannerDate(start, { month: 'short', day: 'numeric' });
  const endLabel = formatPlannerDate(end, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function inclusivePlannerDays(start: string, end: string): number {
  const startTime = new Date(`${start}T12:00:00Z`).getTime();
  const endTime = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}

function goalBoundary(
  goal: NonNullable<MealPlannerProps['nutritionGoals']>[number] | undefined,
): number | null {
  if (!goal) return null;
  if (goal.kind === 'range' || goal.kind === 'limit') return goal.maximum;
  return goal.kind === 'minimum' ? (goal.value ?? goal.minimum) : goal.value;
}

function number(value: number | undefined, maximumFractionDigits = 0): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function recipeForMeal(meal: PlannedMeal, recipes: RecipeListItem[]) {
  return meal.recipeId ? (recipes.find((item) => item.id === meal.recipeId) ?? null) : null;
}

function mealOptions(meal: PlannedMeal): MealPlanOptionInput[] {
  if (meal.kind !== 'options' || !meal.options) return [];
  try {
    const parsed: unknown = JSON.parse(meal.options);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): MealPlanOptionInput[] => {
      if (typeof item !== 'object' || item === null) return [];
      const option = item as Record<string, unknown>;
      if (typeof option.label !== 'string') return [];
      if (option.kind === 'recipe' && typeof option.recipeId === 'string')
        return [{ kind: 'recipe', recipeId: option.recipeId, label: option.label }];
      if (option.kind === 'pantry' && typeof option.productId === 'string')
        return [{ kind: 'pantry', productId: option.productId, label: option.label }];
      return [];
    });
  } catch {
    return [];
  }
}

function mealEntrySnapshot(meal: PlannedMeal): MealEntrySnapshot {
  const item = parseMealPlanIngredientSnapshot(meal.recipeIngredientsSnapshot)?.ingredients[0];
  const options = mealOptions(meal);
  return {
    profileIds: JSON.parse(meal.profileIds ?? '[]'),
    kind: meal.kind as MealPlanEntryInput['kind'],
    ...(options.length ? { options } : {}),
    leftoverSourceId: meal.leftoverSourceId ?? null,
    recipeOverride: meal.recipeOverride ? JSON.parse(meal.recipeOverride) : null,
    foodItem:
      meal.kind === 'item' && item
        ? {
            item: item.item,
            quantity: item.quantity ?? '',
            unit: item.unit,
            note: item.note,
            shoppingCategory: item.shoppingCategory,
            pantryProductId: item.productId ?? '',
          }
        : null,
    plannedFor: meal.plannedFor,
    meal: meal.meal,
    recipeId: meal.recipeId ?? '',
    title: meal.recipeId ? '' : meal.title,
    servings: meal.servings,
    note: meal.note,
  };
}

function MealThumbnail({ meal, recipes }: { meal: PlannedMeal; recipes: RecipeListItem[] }) {
  const recipe = meal.recipeId ? recipes.find((item) => item.id === meal.recipeId) : null;
  if (!recipe?.image) {
    return (
      <span className={cardStyles.mealPlaceholder} aria-hidden="true">
        {mealLabel(meal.meal).charAt(0)}
      </span>
    );
  }
  return (
    <Image
      src={`/api/v1/recipes/${recipe.id}/images/${recipe.image.id}`}
      alt={recipe.image.altText || recipe.title}
      width={recipe.image.width}
      height={recipe.image.height}
      sizes="(max-width: 600px) 80px, 112px"
      unoptimized
    />
  );
}

function PlannedMealCard({
  meal,
  compact = false,
  unconfirmed = false,
  profiles,
  recipes,
  busy,
  pantryStatus,
  onServings,
  onActions,
  onDragStart,
}: {
  meal: PlannedMeal;
  compact?: boolean;
  unconfirmed?: boolean;
  profiles: Array<{ id: string; displayName: string }>;
  recipes: RecipeListItem[];
  busy: boolean;
  pantryStatus: 'covered' | 'shortage' | 'uncertain' | 'unknown';
  onServings: (meal: PlannedMeal, servings: number) => void;
  onActions: (meal: PlannedMeal) => void;
  onDragStart: (mealId: string) => void;
}) {
  const recipe = recipeForMeal(meal, recipes);
  const alternatives = mealOptions(meal);
  const totalMinutes = recipe ? recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes : null;
  const pantryLabel = {
    covered: 'Pantry covered',
    shortage: 'Pantry items missing',
    uncertain: 'Pantry coverage uncertain',
    unknown: 'Pantry coverage not calculated',
  }[pantryStatus];

  return (
    <article
      className={`${cardStyles.plannedMeal} ${compact ? cardStyles.compact : ''}`}
      draggable={!busy && !unconfirmed}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', meal.id);
        onDragStart(meal.id);
      }}
    >
      <div className={cardStyles.mealThumb}>
        {meal.recipeId ? (
          <Link
            href={`/recipes/${meal.recipeId}/cook?mealPlanEntryId=${meal.id}`}
            aria-label={`Make ${meal.recipeTitle}`}
          >
            <MealThumbnail meal={meal} recipes={recipes} />
          </Link>
        ) : (
          <MealThumbnail meal={meal} recipes={recipes} />
        )}
        {pantryStatus !== 'unknown' && (
          <span
            className={`${cardStyles.pantryDot} ${cardStyles[`pantryDot${pantryStatus}`]}`}
            title={pantryLabel}
          >
            <span className="sr-only">{pantryLabel}</span>
          </span>
        )}
      </div>
      <div className={cardStyles.plannedMealCopy}>
        <div className={cardStyles.mealTitleRow}>
          {alternatives.length > 1 ? (
            <div className={cardStyles.mealOptionDisplay} aria-label="Choose one of these meals">
              {alternatives.map((option, index) => (
                <span className={cardStyles.mealOptionChoice} key={`${option.kind}:${index}`}>
                  {index ? <span className={cardStyles.mealOptionOr}>or</span> : null}
                  {option.kind === 'recipe' ? (
                    <Link href={`/recipes/${option.recipeId}/cook`} title={`Make ${option.label}`}>
                      {option.label}
                    </Link>
                  ) : (
                    <strong title={option.label}>{option.label}</strong>
                  )}
                </span>
              ))}
            </div>
          ) : meal.recipeId ? (
            <Link
              className={cardStyles.mealRecipeLink}
              href={`/recipes/${meal.recipeId}/cook?mealPlanEntryId=${meal.id}`}
              title={`Make ${meal.recipeTitle}`}
            >
              {meal.recipeTitle}
            </Link>
          ) : (
            <strong title={meal.recipeTitle}>{meal.recipeTitle}</strong>
          )}
        </div>
        {meal.profileIds && meal.profileIds !== '[]' ? (
          <small className={cardStyles.audience}>
            For{' '}
            {profiles
              .filter((p) => (JSON.parse(meal.profileIds!) as string[]).includes(p.id))
              .map((p) => p.displayName)
              .join(', ') || 'selected members'}
          </small>
        ) : (
          <small className={`${cardStyles.audience} ${cardStyles.sharedAudience}`}>
            Shared household meal
          </small>
        )}
        {meal.kind === 'leftover' ||
        meal.kind === 'takeout' ||
        meal.kind === 'fast' ||
        meal.kind === 'item' ||
        meal.recipeOverride ? (
          <small>
            {meal.kind === 'leftover'
              ? 'Leftovers'
              : meal.kind === 'takeout'
                ? 'Eating out'
                : meal.kind === 'fast'
                  ? 'Fasting'
                  : meal.kind === 'item'
                    ? 'Single food'
                    : 'Adapted for this meal'}
          </small>
        ) : null}
        <span className={cardStyles.mealMeta}>
          <label className={cardStyles.servingEditor} title="Edit servings">
            <UsersRound size={13} aria-hidden="true" />
            <input
              key={`${meal.id}-${meal.servings}-${meal.updatedAt instanceof Date ? meal.updatedAt.toISOString() : meal.updatedAt}`}
              aria-label={`Servings for ${meal.recipeTitle}`}
              type="number"
              min={1}
              max={100}
              defaultValue={meal.servings}
              disabled={busy || unconfirmed}
              onBlur={(event) => {
                const next = Number(event.currentTarget.value);
                if (next !== meal.servings && next >= 1 && next <= 100) onServings(meal, next);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <span>servings</span>
          </label>
          {totalMinutes ? (
            <span className={cardStyles.duration}>
              <Clock3 size={16} aria-hidden="true" /> {formatRecipeDuration(totalMinutes)}
            </span>
          ) : null}
        </span>
      </div>
      <button
        className={cardStyles.mealActionTrigger}
        type="button"
        data-meal-actions={meal.id}
        aria-haspopup="dialog"
        aria-label={`Actions for ${meal.recipeTitle}`}
        onClick={() => {
          onActions(meal);
        }}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
    </article>
  );
}

type PlannedMealActionsProps = {
  meal: PlannedMeal;
  busy: boolean;
  unconfirmed?: boolean;
  dates: string[];
  weekMeals: PlannedMeal[];
  mealTypes: MealTypeOption[];
  pantryStatus: 'covered' | 'shortage' | 'uncertain' | 'unknown';
  onRemove: (id: string) => void;
  onRefreshRecipe: (id: string) => void;
  onEdit: (meal: PlannedMeal) => void;
  onStatus: (id: string, status: 'planned' | 'skipped' | 'cancelled') => void;
  onDuplicate: (meal: PlannedMeal) => void;
  onMove: (meal: PlannedMeal, date: string, mealType: MealType) => void;
  onSwap: (meal: PlannedMeal, target: PlannedMeal) => void;
  onClose: () => void;
};
function PlannedMealActions({
  meal,
  busy,
  unconfirmed,
  dates,
  weekMeals,
  mealTypes,
  pantryStatus,
  onRemove,
  onRefreshRecipe,
  onEdit,
  onStatus,
  onDuplicate,
  onMove,
  onSwap,
  onClose,
}: PlannedMealActionsProps) {
  const [moveTarget, setMoveTarget] = useState(`${meal.plannedFor}:${meal.meal}`);
  const [swapTarget, setSwapTarget] = useState('');
  const pantryLabel = {
    covered: 'Pantry covered',
    shortage: 'Pantry items missing',
    uncertain: 'Pantry coverage uncertain',
    unknown: 'Pantry coverage not calculated',
  }[pantryStatus];
  return (
    <AppDialog
      className={cardStyles.actionDialog}
      onClose={() => {
        if (!busy) onClose();
      }}
      aria-label={`Actions for ${meal.recipeTitle}`}
    >
      <header>
        <div>
          <h2>{meal.recipeTitle}</h2>
          <p>
            {formatPlannerDate(meal.plannedFor, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}{' '}
            · {mealTypeLabel(meal.meal, mealTypes)}
          </p>
          <small>{pantryLabel}</small>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Close meal actions"
          onClick={() => onClose()}
        >
          <X size={20} />
        </button>
      </header>
      <div className={cardStyles.actionBody}>
        {unconfirmed ? (
          <p role="alert">
            A calendar change could not be confirmed. Refresh before making another change.{' '}
            <button type="button" onClick={() => window.location.reload()}>
              Refresh calendar
            </button>
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || unconfirmed}
          onClick={() => {
            onClose();
            onEdit(meal);
          }}
        >
          Edit meal{meal.recipeId ? ' / adapt recipe' : ''}
        </button>
        <button type="button" disabled={busy || unconfirmed} onClick={() => onDuplicate(meal)}>
          <CopyPlus size={14} aria-hidden="true" /> Duplicate to next day
        </button>
        <details className={cardStyles.reschedule}>
          <summary className="recipe-disclosure-summary">
            <span>Reschedule or swap</span>
            <ChevronDown size={18} />
          </summary>
          <div className={cardStyles.mealActionGroup}>
            <span>
              <Move size={14} aria-hidden="true" /> Move to
            </span>
            <select
              aria-label={`Move ${meal.recipeTitle} to another day or meal`}
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              {dates.flatMap((date) =>
                mealTypes.map((option) => (
                  <option key={`${date}:${option.value}`} value={`${date}:${option.value}`}>
                    {formatPlannerDate(date, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {option.label}
                  </option>
                )),
              )}
            </select>
            <button
              type="button"
              disabled={busy || unconfirmed || moveTarget === `${meal.plannedFor}:${meal.meal}`}
              onClick={() => {
                const [date, mealType] = moveTarget.split(':') as [string, MealType];
                onMove(meal, date, mealType);
              }}
            >
              Move
            </button>
          </div>
          {dates[dates.indexOf(meal.plannedFor) - 1] ? (
            <button
              type="button"
              disabled={busy || unconfirmed}
              onClick={() =>
                onMove(meal, dates[dates.indexOf(meal.plannedFor) - 1]!, meal.meal as MealType)
              }
            >
              <ChevronLeft size={16} aria-hidden="true" /> Previous day
            </button>
          ) : null}
          {dates[dates.indexOf(meal.plannedFor) + 1] ? (
            <button
              type="button"
              disabled={busy || unconfirmed}
              onClick={() =>
                onMove(meal, dates[dates.indexOf(meal.plannedFor) + 1]!, meal.meal as MealType)
              }
            >
              <ChevronRight size={16} aria-hidden="true" /> Next day
            </button>
          ) : null}
          <div className={cardStyles.mealActionGroup}>
            <span>
              <ArrowRightLeft size={14} aria-hidden="true" /> Swap with
            </span>
            <select
              aria-label={`Swap ${meal.recipeTitle} with another planned meal`}
              value={swapTarget}
              onChange={(event) => setSwapTarget(event.target.value)}
            >
              <option value="">Choose a meal</option>
              {weekMeals
                .filter((candidate) => candidate.id !== meal.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {formatPlannerDate(candidate.plannedFor, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {mealLabel(candidate.meal)} · {candidate.recipeTitle}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={busy || unconfirmed || !swapTarget}
              onClick={() => {
                const target = weekMeals.find((candidate) => candidate.id === swapTarget);
                if (target) onSwap(meal, target);
              }}
            >
              Swap
            </button>
          </div>
        </details>
        {meal.effectiveStatus === 'cooked' ? (
          <span>Cooked</span>
        ) : (
          <label>
            <span>Status · saves immediately</span>
            <select
              aria-label={`Status for ${meal.recipeTitle}`}
              value={meal.status}
              disabled={busy || unconfirmed}
              onChange={(event) =>
                onStatus(meal.id, event.target.value as 'planned' | 'skipped' | 'cancelled')
              }
            >
              <option value="planned">Planned</option>
              <option value="skipped">Skipped</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        )}
        {meal.recipeId &&
        meal.kind !== 'leftover' &&
        meal.status === 'planned' &&
        meal.effectiveStatus !== 'cooked' ? (
          <Link
            href={`/recipes/${meal.recipeId}/cook?mealPlanEntryId=${meal.id}`}
            aria-label={`Make ${meal.recipeTitle} from this planned meal`}
          >
            Cook this meal
          </Link>
        ) : null}
        {meal.recipeChangedSincePlanning && meal.kind !== 'leftover' ? (
          <button
            type="button"
            disabled={busy || unconfirmed}
            onClick={() => onRefreshRecipe(meal.id)}
          >
            Refresh recipe
          </button>
        ) : null}
        <button
          className={cardStyles.destructiveAction}
          type="button"
          disabled={busy || unconfirmed}
          onClick={() => onRemove(meal.id)}
        >
          <Trash2 size={14} aria-hidden="true" /> Remove
        </button>
      </div>
    </AppDialog>
  );
}

function NutritionPreview({
  nutrition,
  profileName,
  period,
  busy,
}: {
  nutrition: Array<{
    code: string;
    label: string;
    unit: string;
    value: number | undefined;
    target: number | null;
    goalLabel: string;
    goalKind?: string;
    knownDays: number;
    progress: number;
  }>;
  profileName: string;
  period: string;
  busy: boolean;
}) {
  return (
    <section className={styles.insightCard}>
      <h3>Nutrition preview</h3>
      <p className={styles.railDescription}>
        {profileName} · {period}. Daily averages use days with known values for each nutrient.
      </p>
      {busy ? (
        <InlineSkeleton label="Updating nutrition preview" width="100%" />
      ) : nutrition.some((item) => item.value !== undefined) ? (
        <div className={styles.nutrientGrid}>
          {nutrition.map((item) => (
            <div className={styles.nutritionLine} key={item.code}>
              <strong>{item.label}</strong>
              <span>
                {number(item.value)} {item.unit}
              </span>
              <small>
                {item.value === undefined
                  ? 'Unknown'
                  : `${item.knownDays} ${item.knownDays === 1 ? 'day' : 'days'} with data`}
              </small>
              {item.goalLabel ? <small>{item.goalLabel}</small> : null}
              {item.value !== undefined && item.target && item.goalKind === 'target' ? (
                <progress
                  aria-label={`${item.label} compared with target`}
                  max={100}
                  value={item.progress}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.summaryEmpty}>No planned nutrition data for this person and period.</p>
      )}
      <p className={styles.railDescription}>
        Planned estimates, not logged meals. Missing values remain unknown.
      </p>
      <Link className="inline-link" href="/nutrition?view=overview">
        View full nutrition
      </Link>
    </section>
  );
}
function PantryPreview({
  summary,
  meals,
  busy,
  period,
  onGenerate,
  generating,
}: {
  summary: NonNullable<MealPlannerProps['pantrySummary']>;
  meals: number;
  busy: boolean;
  period: string;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <section className={styles.insightCard}>
      <h3>Pantry and shopping</h3>
      <p className={styles.railDescription}>{period}</p>
      {busy ? (
        <InlineSkeleton label="Updating Pantry coverage" width="100%" />
      ) : summary.total > 0 ? (
        <>
          <dl className={styles.coverageCounts}>
            <div>
              <dt>Covered</dt>
              <dd>{summary.covered}</dd>
            </div>
            <div>
              <dt>Short</dt>
              <dd>{summary.short ?? 0}</dd>
            </div>
            <div>
              <dt>Needs review</dt>
              <dd>{summary.uncertain ?? Math.max(0, summary.missing - (summary.short ?? 0))}</dd>
            </div>
          </dl>
          <p className={styles.railDescription}>
            {summary.total} ingredient demand {summary.total === 1 ? 'entry' : 'entries'}. Needs
            review includes unmatched or unconvertible amounts.
          </p>
        </>
      ) : (
        <p className={styles.summaryEmpty}>
          {meals
            ? 'Pantry coverage is not available for these meals yet.'
            : 'Add a meal to calculate coverage.'}
        </p>
      )}
      <Link className="inline-link" href="/pantry">
        View pantry
      </Link>
      <button
        className={styles.shoppingButton}
        type="button"
        disabled={busy || generating || !meals}
        onClick={onGenerate}
      >
        {generating ? (
          <LoadingIndicator label="Creating grocery list" />
        ) : (
          <ShoppingBasket size={18} aria-hidden="true" />
        )}{' '}
        Make grocery list
      </button>
      <small>Creates a Pantry-aware list for the displayed period.</small>
    </section>
  );
}

export function MealPlanner({
  weekStart,
  weekEnd,
  meals,
  recipes,
  profiles,
  collections,
  collectionMemberships,
  nextWeekStart,
  today = weekStart,
  focusDate,
  nutritionProfileName = 'Active person',
  nutritionByDate = {},
  nutritionGoals = [],
  pantrySummary = { covered: 0, total: 0, missing: 0 },
  pantryStatusByMeal = {},
  defaultDuration = 7,
  defaultMealTypes = ['breakfast', 'lunch', 'dinner'],
  mealPlanPreferences = DEFAULT_MEAL_PLAN_PREFERENCES,
  viewMode = 'week',
  weekStartsOn = 1,
  aiMealPlanModel = 'gpt-5.6-terra',
  aiImageGenerationEnabled = true,
  initialAiSummary,
}: MealPlannerProps) {
  const router = useRouter();
  const [agendaMode, setAgendaMode] = useState(false);
  useEffect(() => {
    const measure = () => {
      const fontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const next = window.innerWidth / fontSize < 75;
      setAgendaMode((current) => (current === next ? current : next));
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(document.documentElement);
    const header = document.querySelector('.app-header-shell');
    if (header) observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(
    () => plannerDates(weekStart, defaultDuration).at(-1) ?? weekEnd,
  );
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [mealTypeSettingsOpen, setMealTypeSettingsOpen] = useState(false);
  const [mealTypePreferences, setMealTypePreferences] = useState(mealPlanPreferences);
  const [mealTypeDraft, setMealTypeDraft] = useState(mealPlanPreferences);
  const rangeTriggerRef = useRef<HTMLButtonElement>(null);
  const customMealInputRef = useRef<HTMLInputElement>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorReturnToSettings, setGeneratorReturnToSettings] = useState(false);
  const [mobileReviewOpen, setMobileReviewOpen] = useState(false);
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [customMealName, setCustomMealName] = useState('');
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [selectedMeals, setSelectedMeals] = useState<MealType[]>(defaultMealTypes);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(() =>
    profiles.map((profile) => profile.id),
  );
  const addMealRef = useRef<HTMLButtonElement>(null);
  const [activeMealActions, setActiveMealActions] = useState<PlannedMeal | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [mealEditor, setMealEditor] = useState<{
    entry?: PlannedMeal;
    kind?: string;
    target?: { date: string; meal: MealType };
  } | null>(null);
  const editorCommittedRef = useRef(false);
  const [pickerContext, setPickerContext] = useState<{ date: string; meal: MealType } | null>(null);
  const [draggedMealId, setDraggedMealId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNutritionOpen, setMobileNutritionOpen] = useState(false);
  const selectedMobileDate = plannerFocus(focusDate, weekStart, weekEnd, today);
  const [unconfirmedChange, setUnconfirmedChange] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedbackDestination, setFeedbackDestination] = useState<{
    date: string;
    label: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<MealHistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<MealHistoryCommand[]>([]);

  const dates = useMemo(
    () => plannerDates(weekStart, inclusivePlannerDays(weekStart, weekEnd)),
    [weekEnd, weekStart],
  );
  const rangeError = planningRangeError(startDate, endDate);
  const setupValid =
    !rangeError &&
    selectedMeals.length > 0 &&
    selectedMeals.length <= 5 &&
    selectedProfileIds.length > 0;
  const typeDraftDirty = JSON.stringify(mealTypeDraft) !== JSON.stringify(mealTypePreferences);
  const setupKey = 'bord-planner-setup-v1';
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(setupKey) ?? 'null');
        if (
          saved &&
          !planningRangeError(saved.startDate, saved.endDate) &&
          Array.isArray(saved.meals) &&
          saved.meals.length <= 20 &&
          saved.meals.every((value: unknown) => typeof value === 'string' && value.length <= 80) &&
          Array.isArray(saved.people) &&
          saved.people.length <= 20
        ) {
          setStartDate(saved.startDate);
          setEndDate(saved.endDate);
          setSelectedMeals(saved.meals);
          setSelectedProfileIds(
            saved.people.filter((id: string) => profiles.some((profile) => profile.id === id)),
          );
        }
      } catch {
        /* Setup remains usable when session storage is unavailable. */
      }
      setSetupLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // Restore only once per mounted calendar; subsequent prop refreshes must retain local setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!setupLoaded) return;
    try {
      sessionStorage.setItem(
        setupKey,
        JSON.stringify({ startDate, endDate, meals: selectedMeals, people: selectedProfileIds }),
      );
    } catch {
      /* Temporary setup is still available while this page stays open. */
    }
  }, [setupLoaded, startDate, endDate, selectedMeals, selectedProfileIds]);
  const selectedProfiles = profiles.filter((profile) => selectedProfileIds.includes(profile.id));
  const duration = inclusivePlannerDays(startDate, endDate);
  const selectedPlanEnd = endDate;
  const mealTypeOptions = plannerMealOptions(mealTypePreferences, [
    ...selectedMeals,
    ...meals.map((meal) => meal.meal),
  ]);
  const draftTypeOptions = plannerMealOptions(mealTypeDraft, []);
  const scheduleMeals = mealTypeOptions.filter(
    (option) =>
      mealTypePreferences.visibleMealTypes.includes(option.value) ||
      selectedMeals.includes(option.value) ||
      meals.some((meal) => meal.meal === option.value),
  );
  const selectedDayMeals = meals.filter((meal) => meal.plannedFor === selectedMobileDate);
  const monthLeadingDays = (new Date(`${weekStart}T12:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7;
  const monthWeekdayLabels = plannerDates(weekStartsOn === 1 ? '2026-07-20' : '2026-07-19', 7).map(
    (date) => formatPlannerDate(date, { weekday: 'short' }),
  );
  const plannedDays = Object.values(nutritionByDate).filter(
    (totals) => Object.keys(totals).length > 0,
  );
  const nutrientAverage = (code: string) => {
    const values = plannedDays
      .map((day) => day[code])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : undefined;
  };
  const nutrition = [
    { code: 'energy_kcal', label: 'Calories', unit: 'kcal' },
    { code: 'protein', label: 'Protein', unit: 'g' },
    { code: 'carbohydrate', label: 'Carbs', unit: 'g' },
    { code: 'total_fat', label: 'Fat', unit: 'g' },
  ].map((item) => {
    const value = nutrientAverage(item.code);
    const goal = nutritionGoals.find((goal) => goal.nutrientCode === item.code);
    const target = goalBoundary(goal);
    const goalLabel = !goal
      ? ''
      : goal.kind === 'range'
        ? `Range ${number(goal.minimum ?? undefined)}–${number(goal.maximum ?? undefined)} ${item.unit}`
        : `${goal.kind === 'minimum' ? 'Minimum' : goal.kind === 'limit' ? 'Limit' : 'Target'} ${number(target ?? undefined)} ${item.unit}`;
    return {
      ...item,
      value,
      target,
      goalLabel,
      goalKind: goal?.kind,
      knownDays: plannedDays.filter((day) => Number.isFinite(day[item.code])).length,
      progress: value !== undefined && target ? Math.min(100, (value / target) * 100) : 0,
    };
  });
  const summaryBusy = Boolean(busyAction && busyAction !== 'shopping-list');
  const totalServings = meals.reduce((total, meal) => total + meal.servings, 0);
  const recipesUsed = new Set(meals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : []))).size;

  function navigateWeek(target: string | null) {
    navigatePeriod(target, 'week');
  }

  function navigatePeriod(target: string | null, mode: 'day' | 'week' | 'month' = viewMode) {
    const anchor = target ?? today;
    router.push(`/planner?view=${mode}&date=${anchor}`);
  }

  function returnToMealAction(id: string) {
    window.requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-meal-actions]')).find(
        (element) => element.dataset.mealActions === id && element.getClientRects().length > 0,
      );
      (target ?? addMealRef.current)?.focus();
    });
  }
  function closeMealActions() {
    if (busyAction) return;
    const id = activeMealActions?.id;
    setActiveMealActions(null);
    if (id) returnToMealAction(id);
  }
  const refreshedActionMeal = activeMealActions
    ? meals.find((meal) => meal.id === activeMealActions.id)
    : undefined;
  const actionMeal =
    refreshedActionMeal &&
    activeMealActions &&
    new Date(refreshedActionMeal.updatedAt).getTime() >=
      new Date(activeMealActions.updatedAt).getTime()
      ? refreshedActionMeal
      : activeMealActions;

  function recordHistory(command: MealHistoryCommand) {
    setUndoStack((current) => [...current.slice(-19), command]);
    setRedoStack([]);
  }

  async function calendarRequest(input: RequestInfo | URL, init: RequestInit) {
    setFeedbackDestination(null);
    try {
      const response = await fetch(input, init);
      if (response.status >= 500) setUnconfirmedChange(true);
      return response;
    } catch (error) {
      setUnconfirmedChange(true);
      throw error;
    }
  }

  async function deleteHistoryEntries(ids: string[]) {
    for (const id of ids) {
      const response = await calendarRequest(`/api/v1/meal-plan/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('A meal changed before it could be removed.');
    }
  }

  async function restoreHistoryEntries(entries: MealEntrySnapshot[]): Promise<string[]> {
    const response = await calendarRequest('/api/v1/meal-plan/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    const body = (await response.json().catch(() => null)) as {
      meals?: PlannedMeal[];
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.meals) {
      throw new Error(body?.error?.message ?? 'Those meals could not be restored.');
    }
    return body.meals
      .filter((meal) =>
        entries.some((entry) => entry.plannedFor === meal.plannedFor && entry.meal === meal.meal),
      )
      .map((meal) => meal.id);
  }

  async function runHistory(direction: 'undo' | 'redo') {
    const source = direction === 'undo' ? undoStack : redoStack;
    const command = source.at(-1);
    if (!command || busyAction) return;
    setBusyAction(direction);
    setError(null);
    try {
      let nextCommand: MealHistoryCommand;
      if (command.kind === 'added' || command.kind === 'removed') {
        const shouldDelete =
          (direction === 'undo' && command.kind === 'added') ||
          (direction === 'redo' && command.kind === 'removed');
        if (shouldDelete) {
          await deleteHistoryEntries(command.ids);
          nextCommand = { ...command };
        } else {
          nextCommand = {
            ...command,
            ids: await restoreHistoryEntries(command.entries),
          };
        }
      } else if (command.kind === 'updated') {
        const desired = direction === 'undo' ? command.before : command.after;
        const response = await calendarRequest(`/api/v1/meal-plan/${command.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...desired, expectedUpdatedAt: command.currentUpdatedAt }),
        });
        const body = (await response.json().catch(() => null)) as {
          meal?: PlannedMeal;
          error?: { message?: string };
        } | null;
        if (!response.ok || !body?.meal) {
          throw new Error(body?.error?.message ?? 'That meal changed before it could be restored.');
        }
        nextCommand = {
          ...command,
          currentUpdatedAt: new Date(body.meal.updatedAt).toISOString(),
        };
      } else if (command.kind === 'status') {
        const response = await calendarRequest(`/api/v1/meal-plan/${command.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: direction === 'undo' ? command.before : command.after }),
        });
        if (!response.ok) throw new Error('That meal status could not be restored.');
        nextCommand = { ...command };
      } else {
        const response = await calendarRequest('/api/v1/meal-plan/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: command.sourceId,
            targetId: command.targetId,
            sourceExpectedUpdatedAt: command.sourceUpdatedAt,
            targetExpectedUpdatedAt: command.targetUpdatedAt,
          }),
        });
        const body = (await response.json().catch(() => null)) as {
          meals?: PlannedMeal[];
          error?: { message?: string };
        } | null;
        if (!response.ok || body?.meals?.length !== 2) {
          throw new Error(
            body?.error?.message ?? 'Those meals changed before they could be swapped.',
          );
        }
        const source = body.meals.find((meal) => meal.id === command.sourceId);
        const target = body.meals.find((meal) => meal.id === command.targetId);
        if (!source || !target) throw new Error('The swapped meals could not be restored.');
        nextCommand = {
          ...command,
          sourceUpdatedAt: new Date(source.updatedAt).toISOString(),
          targetUpdatedAt: new Date(target.updatedAt).toISOString(),
        };
      }
      if (direction === 'undo') {
        setUndoStack((current) => current.slice(0, -1));
        setRedoStack((current) => [...current.slice(-19), nextCommand]);
      } else {
        setRedoStack((current) => current.slice(0, -1));
        setUndoStack((current) => [...current.slice(-19), nextCommand]);
      }
      setFeedback(`${direction === 'undo' ? 'Undid' : 'Redid'} ${command.label}.`);
      router.refresh();
    } catch (historyError) {
      setError(
        historyError instanceof Error ? historyError.message : 'That change could not be restored.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  function closeSettings() {
    if (preferencesBusy) return;
    if (
      mealTypeSettingsOpen &&
      typeDraftDirty &&
      !window.confirm('Discard unsaved meal type changes?')
    )
      return;
    setMealTypeDraft(mealTypePreferences);
    setMealTypeSettingsOpen(false);
    setSettingsOpen(false);
  }
  function openGenerator(fromSettings = false) {
    if (!setupValid) return;
    setGeneratorReturnToSettings(fromSettings);
    setSettingsOpen(false);
    setGeneratorOpen(true);
  }
  function selectCalendarDate(date: string) {
    navigatePeriod(date);
  }

  function openRecipePicker(
    date = selectedMobileDate,
    meal: MealType = selectedMeals[0] ?? 'dinner',
  ) {
    if (unconfirmedChange) {
      setFeedback('Refresh the calendar to check the unconfirmed change before adding meals.');
      return;
    }
    if (!selectedProfileIds.length) {
      setSettingsOpen(true);
      setFeedback('Choose at least one person before adding meals.');
      return;
    }
    setPickerContext({ date, meal });
    setSelectorOpen(true);
  }

  function toggleMeal(meal: MealType) {
    setSelectedMeals((current) =>
      current.includes(meal) ? current.filter((item) => item !== meal) : [...current, meal],
    );
  }

  function toggleVisibleMealType(meal: MealType) {
    setMealTypeDraft((current) => {
      const visibleMealTypes = current.visibleMealTypes.includes(meal)
        ? current.visibleMealTypes.filter((item) => item !== meal)
        : [...current.visibleMealTypes, meal];
      return { ...current, visibleMealTypes };
    });
  }

  function addCustomMealType() {
    const label = customMealName.trim();
    setPreferencesError(null);
    if (!label) {
      setPreferencesError('Enter a meal type name.');
      return;
    }
    if (mealTypeDraft.customMealTypes.length >= 10) {
      setPreferencesError('You can have up to 10 custom meal types.');
      return;
    }
    if (
      draftTypeOptions.some(
        (option) => option.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
      )
    ) {
      setPreferencesError('That meal type name already exists.');
      return;
    }
    const base = label
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '')
      .slice(0, 32);
    if (!base) {
      setPreferencesError('Include a letter or number in the name.');
      return;
    }
    let value = `custom-${base}`;
    let suffix = 2;
    while (draftTypeOptions.some((option) => option.value === value)) {
      value = `custom-${base}-${suffix}`;
      suffix += 1;
    }
    setMealTypeDraft((current) => ({
      ...current,
      customMealTypes: [...current.customMealTypes, { value, label }],
      visibleMealTypes: [...current.visibleMealTypes, value],
    }));
    setCustomMealName('');
  }

  function removeCustomMealType(meal: MealType) {
    customMealInputRef.current?.focus();
    setMealTypeDraft((current) => ({
      ...current,
      customMealTypes: current.customMealTypes.filter((option) => option.value !== meal),
      visibleMealTypes: current.visibleMealTypes.filter((value) => value !== meal),
      defaultMealTypes: current.defaultMealTypes.filter((value) => value !== meal),
    }));
  }

  async function saveMealTypePreferences() {
    const submitted = mealTypeDraft;
    setPreferencesBusy(true);
    try {
      setPreferencesError(null);
      const response = await fetch('/api/v1/settings/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'mealPlan', values: submitted }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setPreferencesError(body?.error?.message ?? 'We could not save those meal types.');
        return;
      }
      setSelectedMeals((current) =>
        current.filter((meal) => submitted.visibleMealTypes.includes(meal)),
      );
      setMealTypePreferences(submitted);
      setMealTypeDraft(submitted);
      setMealTypeSettingsOpen(false);
      setFeedback('Meal types saved.');
      router.refresh();
    } catch {
      setPreferencesError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setPreferencesBusy(false);
    }
  }

  function toggleProfile(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    );
  }

  function updatePayload(
    meal: PlannedMeal,
    overrides: Partial<Pick<PlannedMeal, 'plannedFor' | 'meal' | 'servings'>> = {},
  ) {
    return {
      plannedFor: overrides.plannedFor ?? meal.plannedFor,
      meal: overrides.meal ?? meal.meal,
      recipeId: meal.recipeId ?? '',
      profileIds: JSON.parse(meal.profileIds ?? '[]'),
      title: meal.recipeId ? '' : meal.title,
      kind: meal.kind as MealPlanEntryInput['kind'],
      ...(mealOptions(meal).length ? { options: mealOptions(meal) } : {}),
      leftoverSourceId: meal.leftoverSourceId ?? null,
      foodItem: mealEntrySnapshot(meal).foodItem,
      recipeOverride: meal.recipeOverride ? JSON.parse(meal.recipeOverride) : null,
      servings: overrides.servings ?? meal.servings,
      note: meal.note,
      expectedUpdatedAt:
        meal.updatedAt instanceof Date
          ? meal.updatedAt.toISOString()
          : new Date(meal.updatedAt).toISOString(),
    };
  }

  async function updateMealEntry(
    meal: PlannedMeal,
    overrides: Partial<Pick<PlannedMeal, 'plannedFor' | 'meal' | 'servings'>>,
    successMessage: string,
  ) {
    setBusyAction(meal.id);
    try {
      setError(null);
      const response = await calendarRequest(`/api/v1/meal-plan/${meal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload(meal, overrides)),
      });
      const body = (await response.json().catch(() => null)) as {
        meal?: PlannedMeal;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.meal) {
        setError(body?.error?.message ?? 'We could not update that meal. Refresh and try again.');
        return;
      }
      recordHistory({
        kind: 'updated',
        label: successMessage.replace(/\.$/u, '').toLocaleLowerCase(),
        id: meal.id,
        before: mealEntrySnapshot(meal),
        after: mealEntrySnapshot(body.meal),
        currentUpdatedAt: new Date(body.meal.updatedAt).toISOString(),
      });
      setActiveMealActions((current) => (current?.id === body.meal!.id ? body.meal! : current));
      if (
        overrides.plannedFor &&
        (overrides.plannedFor < weekStart || overrides.plannedFor > weekEnd)
      ) {
        setActiveMealActions(null);
        setFeedbackDestination({ date: overrides.plannedFor, label: 'View moved meal' });
        window.requestAnimationFrame(() => addMealRef.current?.focus());
      }
      setFeedback(successMessage);
      router.refresh();
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function duplicateMeal(meal: PlannedMeal) {
    const targetDate = nextMealDate(meal.plannedFor);
    setBusyAction(meal.id);
    try {
      setError(null);
      const response = await calendarRequest('/api/v1/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannedFor: targetDate,
          meal: meal.meal,
          recipeId: meal.recipeId ?? '',
          profileIds: JSON.parse(meal.profileIds ?? '[]'),
          title: meal.recipeId ? '' : meal.title,
          kind: meal.kind as MealPlanEntryInput['kind'],
          ...(mealOptions(meal).length ? { options: mealOptions(meal) } : {}),
          leftoverSourceId: meal.leftoverSourceId ?? null,
          foodItem: mealEntrySnapshot(meal).foodItem,
          recipeOverride: meal.recipeOverride ? JSON.parse(meal.recipeOverride) : null,
          servings: meal.servings,
          note: meal.note,
        }),
      });
      const body = (await response.json().catch(() => null)) as { meal?: PlannedMeal } | null;
      if (!response.ok || !body?.meal) {
        setError('We could not duplicate that meal. Try again.');
        return;
      }
      recordHistory({
        kind: 'added',
        label: `adding ${meal.recipeTitle}`,
        entries: [mealEntrySnapshot(body.meal)],
        ids: [body.meal.id],
      });
      setFeedback(
        `Meal duplicated to ${formatPlannerDate(targetDate, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}.`,
      );
      if (targetDate > weekEnd || targetDate < weekStart)
        setFeedbackDestination({ date: targetDate, label: 'View duplicated meal' });
      router.refresh();
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function swapMeals(source: PlannedMeal, target: PlannedMeal) {
    setBusyAction(source.id);
    try {
      setError(null);
      const response = await calendarRequest('/api/v1/meal-plan/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source.id,
          targetId: target.id,
          sourceExpectedUpdatedAt:
            source.updatedAt instanceof Date
              ? source.updatedAt.toISOString()
              : new Date(source.updatedAt).toISOString(),
          targetExpectedUpdatedAt:
            target.updatedAt instanceof Date
              ? target.updatedAt.toISOString()
              : new Date(target.updatedAt).toISOString(),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        meals?: PlannedMeal[];
        error?: { message?: string };
      } | null;
      if (!response.ok || body?.meals?.length !== 2) {
        setError(body?.error?.message ?? 'We could not swap those meals. Refresh and try again.');
        return;
      }
      const nextSource = body.meals.find((meal) => meal.id === source.id);
      const nextTarget = body.meals.find((meal) => meal.id === target.id);
      if (!nextSource || !nextTarget) {
        setError('We could not verify the swapped meals. Refresh and try again.');
        return;
      }
      recordHistory({
        kind: 'swapped',
        label: `swapping ${source.recipeTitle} and ${target.recipeTitle}`,
        sourceId: source.id,
        targetId: target.id,
        sourceUpdatedAt: new Date(nextSource.updatedAt).toISOString(),
        targetUpdatedAt: new Date(nextTarget.updatedAt).toISOString(),
      });
      setActiveMealActions((current) =>
        current ? (body.meals!.find((meal) => meal.id === current.id) ?? current) : null,
      );
      setFeedback('Meals swapped.');
      router.refresh();
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  function handleDrop(date: string, mealType: MealType, targetMeal?: PlannedMeal) {
    const source = meals.find((meal) => meal.id === draggedMealId);
    setDraggedMealId(null);
    if (!source || source.id === targetMeal?.id) return;
    if (targetMeal) {
      void swapMeals(source, targetMeal);
      return;
    }
    void updateMealEntry(source, { plannedFor: date, meal: mealType }, 'Meal moved.');
  }

  function handleSlotKeyDown(event: KeyboardEvent<HTMLElement>, date: string, mealType: MealType) {
    const dateIndex = dates.indexOf(date);
    const mealIndex = scheduleMeals.findIndex((option) => option.value === mealType);
    const nextDate =
      event.key === 'ArrowLeft'
        ? dates[Math.max(0, dateIndex - 1)]
        : event.key === 'ArrowRight'
          ? dates[Math.min(dates.length - 1, dateIndex + 1)]
          : date;
    const nextMeal =
      event.key === 'ArrowUp'
        ? scheduleMeals[Math.max(0, mealIndex - 1)]?.value
        : event.key === 'ArrowDown'
          ? scheduleMeals[Math.min(scheduleMeals.length - 1, mealIndex + 1)]?.value
          : mealType;
    if (nextDate === date && nextMeal === mealType) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    document.querySelector<HTMLElement>(`[data-planner-slot="${nextDate}:${nextMeal}"]`)?.focus();
  }

  function navigateMobileDay(amount: -1 | 1) {
    const index = dates.indexOf(selectedMobileDate);
    const target = dates[index + amount];
    if (target) {
      selectCalendarDate(target);
      return;
    }
    navigatePeriod(addPlannerDays(selectedMobileDate, amount), 'day');
  }

  function navigateMobilePeriod(amount: -1 | 1) {
    if (viewMode === 'day') {
      navigateMobileDay(amount);
      return;
    }
    navigatePeriod(shiftPlannerFocus(selectedMobileDate, viewMode, amount), viewMode);
  }

  async function copyWeek() {
    setBusyAction('copy');
    try {
      setError(null);
      setFeedback(null);
      const response = await calendarRequest('/api/v1/meal-plan/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, destinationWeekStart: nextWeekStart }),
      });
      if (!response.ok) {
        setError('We could not copy this week yet. Try again in a moment.');
        return;
      }
      navigateWeek(nextWeekStart);
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function removeMeal(id: string) {
    const meal = meals.find((candidate) => candidate.id === id);
    if (!meal || !window.confirm(`Remove ${meal.recipeTitle} from this plan?`)) return;
    setBusyAction(id);
    try {
      setError(null);
      const response = await calendarRequest(`/api/v1/meal-plan/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('We could not remove that meal. Try again.');
        return;
      }
      recordHistory({
        kind: 'removed',
        label: `removing ${meal.recipeTitle}`,
        entries: [mealEntrySnapshot(meal)],
        ids: [meal.id],
      });
      setActiveMealActions((current) => (current?.id === id ? null : current));
      window.requestAnimationFrame(() => addMealRef.current?.focus());
      setFeedback('Meal removed from the plan.');
      router.refresh();
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function updateMealStatus(id: string, status: 'planned' | 'skipped' | 'cancelled') {
    const meal = meals.find((candidate) => candidate.id === id);
    if (!meal || meal.status === status) return;
    setBusyAction(id);
    try {
      setError(null);
      const response = await calendarRequest(`/api/v1/meal-plan/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = (await response.json().catch(() => null)) as {
        meal?: PlannedMeal;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.meal) {
        setError(body?.error?.message ?? 'We could not update that meal status. Try again.');
        return;
      }
      recordHistory({
        kind: 'status',
        label: `marking ${meal.recipeTitle} ${status}`,
        id,
        before: meal.status,
        after: status,
      });
      setActiveMealActions((current) => (current?.id === id ? body.meal! : current));
      setFeedback(`Meal marked ${status}.`);
      router.refresh();
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshPlannedRecipe(id: string) {
    setBusyAction(id);
    try {
      setError(null);
      const response = await calendarRequest(`/api/v1/meal-plan/${id}/refresh-recipe`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError('We could not refresh that planned recipe. Try again.');
        return;
      }
      setFeedback('The plan now uses the current recipe and Nutrition calculation.');
      router.refresh();
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function generateList() {
    setBusyAction('shopping-list');
    try {
      setError(null);
      setFeedback(null);
      const response = await fetch('/api/v1/shopping-lists/pantry-shortages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, weekEnd }),
      });
      const body = (await response.json().catch(() => null)) as {
        listId?: string;
        restored?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.listId) {
        setError(body?.error?.message ?? 'Plan at least one meal before generating a list.');
        return;
      }
      router.push(`/lists/${body.listId}${body.restored ? '?restored=1' : ''}`);
    } catch {
      setError(
        'We could not confirm that change. Check your connection, refresh the plan, and try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  function handleRecipesSaved(count: number, addedMeals: PlannedMeal[]) {
    setSelectorOpen(false);
    setSettingsOpen(false);
    setFeedback(`${count} ${count === 1 ? 'recipe was' : 'recipes were'} added to your plan.`);
    if (addedMeals.length) {
      recordHistory({
        kind: 'added',
        label: `adding ${count} ${count === 1 ? 'recipe' : 'recipes'}`,
        entries: addedMeals.map(mealEntrySnapshot),
        ids: addedMeals.map((meal) => meal.id),
      });
    }
    if (!pickerContext && (startDate < weekStart || startDate > weekEnd)) navigateWeek(startDate);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        className="planner-page-heading"
        density="compact"
        title="Meal planner"
        titleId="planner-page-title"
        description="Your household meal calendar."
        actions={
          <div className={styles.headerActions}>
            {' '}
            <button
              ref={addMealRef}
              className={styles.addMealsButton}
              type="button"
              disabled={unconfirmedChange}
              onClick={() => openRecipePicker(selectedMobileDate)}
            >
              <Plus size={17} /> Add a meal
            </button>
            <button
              className={styles.planOptionsButton}
              type="button"
              aria-expanded={settingsOpen}
              aria-controls="planner-settings-panel"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
            >
              Plan settings
            </button>
            <KitchenPrintDialog kind="meal-plan" start={weekStart} end={weekEnd} />
          </div>
        }
      />
      <div className={styles.calendarControls} aria-label="Calendar controls">
        <span className={styles.periodLabel}>
          {viewMode === 'day'
            ? formatPlannerDate(weekStart, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : viewMode === 'month'
              ? formatPlannerDate(weekStart, { month: 'long', year: 'numeric' })
              : humanRange(weekStart, weekEnd)}
        </span>

        <div className={styles.weekNavigation} aria-label="Planner period navigation">
          <button
            type="button"
            aria-label={`Previous ${viewMode}`}
            title={`Previous ${viewMode}`}
            onClick={() => navigatePeriod(shiftPlannerFocus(selectedMobileDate, viewMode, -1))}
          >
            <ChevronLeft size={18} aria-hidden="true" /> <span>Previous</span>
          </button>
          <div className={styles.viewModeControl} role="group" aria-label="Planner view">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                aria-pressed={viewMode === mode}
                onClick={() => navigatePeriod(selectedMobileDate, mode)}
              >
                {mode.charAt(0).toLocaleUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={`Next ${viewMode}`}
            title={`Next ${viewMode}`}
            onClick={() => navigatePeriod(shiftPlannerFocus(selectedMobileDate, viewMode, 1))}
          >
            <span>Next</span> <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <button type="button" onClick={() => navigatePeriod(today)}>
          Today
        </button>
        <label className={styles.dateJump}>
          Go to date
          <input
            type="date"
            value={selectedMobileDate}
            onChange={(event) => {
              if (event.target.value) navigatePeriod(event.target.value);
            }}
          />
        </label>
        <div className={styles.historyControls} aria-label="Planner save history">
          <button
            type="button"
            disabled={!undoStack.length || Boolean(busyAction) || unconfirmedChange}
            title={undoStack.length ? `Undo ${undoStack.at(-1)?.label}` : 'Nothing to undo'}
            aria-label="Undo last planner change"
            onClick={() => void runHistory('undo')}
          >
            <Undo2 size={17} aria-hidden="true" /> <span>Undo</span>
          </button>
          <button
            type="button"
            disabled={!redoStack.length || Boolean(busyAction) || unconfirmedChange}
            title={redoStack.length ? `Redo ${redoStack.at(-1)?.label}` : 'Nothing to redo'}
            aria-label="Redo last planner change"
            onClick={() => void runHistory('redo')}
          >
            <Redo2 size={17} aria-hidden="true" /> <span>Redo</span>
          </button>
          <span role="status" className={styles.saveStatus}>
            <Save size={17} aria-hidden="true" />
            {busyAction
              ? 'Saving…'
              : error || unconfirmedChange
                ? 'Needs attention'
                : 'Calendar saved'}
          </span>
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
        <DismissibleDetails
          className={styles.moreActions}
          viewportPanel
          summary={
            <>
              <Ellipsis size={18} aria-hidden="true" /> More actions
            </>
          }
        >
          <div>
            <button
              type="button"
              disabled={
                viewMode !== 'week' || Boolean(busyAction) || unconfirmedChange || !meals.length
              }
              data-menu-close
              onClick={() => {
                if (
                  window.confirm(
                    `Add copies to ${humanRange(nextWeekStart, addPlannerDays(nextWeekStart, 6))}? Existing meals stay. Copies start as planned; this action has no Undo.`,
                  )
                )
                  void copyWeek();
              }}
            >
              <Copy size={16} aria-hidden="true" /> Copy to next week
            </button>
            <p>
              Adds meals to {humanRange(nextWeekStart, addPlannerDays(nextWeekStart, 6))}, including
              occupied dates. Copies start as planned; this action has no Undo.
            </p>
          </div>
        </DismissibleDetails>
      </div>
      <div
        className={`${styles.plannerLayout} ${agendaMode ? styles.agendaMode : ''} planner-workspace-grid`}
        data-planner-layout={agendaMode ? 'agenda' : 'calendar'}
      >
        {settingsOpen && (
          <AppDialog
            className={settingsStyles.dialog}
            id="planner-settings-panel"
            onClose={closeSettings}
            aria-labelledby="planner-settings-title"
            aria-describedby="planner-settings-description"
          >
            <div className={settingsStyles.setupHeading}>
              <div>
                <h2 id="planner-settings-title">Plan settings</h2>
                <p id="planner-settings-description" className={settingsStyles.railDescription}>
                  Defaults for new meals and generation. Existing meals keep their dates, people and
                  portions.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close plan settings"
                disabled={preferencesBusy}
                onClick={closeSettings}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className={settingsStyles.content}>
              <fieldset className={settingsStyles.setupStep}>
                <legend>
                  <span>1</span> Date range
                </legend>
                <div
                  className={settingsStyles.dateRangeField}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && rangePickerOpen) {
                      event.preventDefault();
                      event.stopPropagation();
                      setRangePickerOpen(false);
                      rangeTriggerRef.current?.focus();
                    }
                  }}
                >
                  <button
                    ref={rangeTriggerRef}
                    className={settingsStyles.dateRangeVisual}
                    type="button"
                    aria-expanded={rangePickerOpen}
                    aria-controls="planner-date-range-picker"
                    onClick={() => setRangePickerOpen((open) => !open)}
                  >
                    <CalendarDays size={18} />
                    <span>{humanRange(startDate, selectedPlanEnd)}</span>
                    <ChevronDown
                      className={rangePickerOpen ? settingsStyles.dateRangeChevronOpen : undefined}
                      size={18}
                    />
                  </button>
                  {rangePickerOpen ? (
                    <div
                      className={settingsStyles.dateRangePicker}
                      id="planner-date-range-picker"
                      role="group"
                      aria-label="Choose planning date range"
                    >
                      <div
                        className={settingsStyles.dateRangeQuickActions}
                        aria-label="Quick date ranges"
                      >
                        <span>From today</span>
                        <div>
                          {[3, 5, 7, 14].map((days) => (
                            <button
                              type="button"
                              key={days}
                              onClick={() => {
                                setStartDate(today);
                                setEndDate(addPlannerDays(today, days - 1));
                              }}
                            >
                              {days} days
                            </button>
                          ))}
                        </div>
                      </div>
                      <label>
                        <span>Start date</span>
                        <input
                          type="date"
                          value={startDate}
                          aria-describedby="planner-range-help"
                          onInput={(event) => {
                            const nextStart = event.currentTarget.value;
                            if (!nextStart) {
                              setStartDate('');
                              return;
                            }
                            const maximumEnd = addPlannerDays(nextStart, 13);
                            setStartDate(nextStart);
                            setEndDate((currentEnd) => {
                              if (currentEnd < nextStart) return nextStart;
                              if (currentEnd > maximumEnd) return maximumEnd;
                              return currentEnd;
                            });
                          }}
                          required
                        />
                      </label>
                      <label>
                        <span>End date</span>
                        <input
                          type="date"
                          min={startDate}
                          max={startDate ? addPlannerDays(startDate, 13) : undefined}
                          aria-invalid={Boolean(rangeError)}
                          aria-describedby="planner-range-help"
                          value={endDate}
                          onInput={(event) => {
                            setEndDate(event.currentTarget.value);
                          }}
                          required
                        />
                      </label>
                      <div className={settingsStyles.dateRangePickerFooter}>
                        <span>
                          {rangeError
                            ? 'Invalid date range'
                            : `${duration} ${duration === 1 ? 'day' : 'days'} selected`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRangePickerOpen(false);
                            rangeTriggerRef.current?.focus();
                          }}
                        >
                          Close date range
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <p
                  id="planner-range-help"
                  className={settingsStyles.railDescription}
                  role={rangeError ? 'alert' : undefined}
                >
                  {rangeError ??
                    '1–14 days for new planning. Changing the start adjusts the end to these bounds; the visible calendar stays unchanged.'}
                </p>
              </fieldset>

              <fieldset className={settingsStyles.setupStep}>
                <legend>
                  <span>2</span>
                  <span className={settingsStyles.stepTitle}>Meals to plan</span>
                  <button
                    className={settingsStyles.legendAction}
                    type="button"
                    disabled={preferencesBusy}
                    aria-expanded={mealTypeSettingsOpen}
                    aria-controls="planner-meal-type-settings"
                    onClick={() => {
                      if (mealTypeSettingsOpen) {
                        if (typeDraftDirty && !window.confirm('Discard unsaved meal type changes?'))
                          return;
                        setMealTypeDraft(mealTypePreferences);
                      } else setMealTypeDraft(mealTypePreferences);
                      setPreferencesError(null);
                      setMealTypeSettingsOpen((open) => !open);
                    }}
                  >
                    Manage meal types
                  </button>
                </legend>
                {mealTypeSettingsOpen ? (
                  <div
                    className={settingsStyles.mealTypeSettings}
                    id="planner-meal-type-settings"
                    role="group"
                    aria-label="Meal types shown in the planner"
                  >
                    <div className={settingsStyles.mealTypeSettingsHeader}>
                      <div>
                        <strong>Meal types</strong>
                        <span>
                          Household row preferences. Rows with existing meals or current planning
                          selections remain accessible.
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Close meal type settings"
                        disabled={preferencesBusy}
                        onClick={() => {
                          if (
                            typeDraftDirty &&
                            !window.confirm('Discard unsaved meal type changes?')
                          )
                            return;
                          setMealTypeDraft(mealTypePreferences);
                          setMealTypeSettingsOpen(false);
                        }}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <div className={settingsStyles.mealTypeOptionList}>
                      {draftTypeOptions.map((option) => (
                        <div key={option.value} className={settingsStyles.typeRow}>
                          <label>
                            <input
                              type="checkbox"
                              disabled={preferencesBusy}
                              checked={mealTypeDraft.visibleMealTypes.includes(option.value)}
                              onChange={() => toggleVisibleMealType(option.value)}
                            />
                            <span>
                              <strong>{option.label}</strong>
                              {option.description ? <small>{option.description}</small> : null}
                            </span>
                          </label>
                          {option.value.startsWith('custom-') ? (
                            <button
                              type="button"
                              disabled={preferencesBusy}
                              aria-label={`Remove custom meal type ${option.label}`}
                              onClick={(event) => {
                                event.preventDefault();
                                removeCustomMealType(option.value);
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <fieldset
                      disabled={preferencesBusy}
                      className={settingsStyles.customMealTypeForm}
                    >
                      <label>
                        <span>Custom meal type</span>
                        <input
                          ref={customMealInputRef}
                          value={customMealName}
                          maxLength={48}
                          placeholder="e.g. Afternoon tea"
                          onChange={(event) => setCustomMealName(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!customMealName.trim()}
                        onClick={addCustomMealType}
                      >
                        Add
                      </button>
                    </fieldset>
                    {preferencesError ? <p role="alert">{preferencesError}</p> : null}
                    <button
                      className={settingsStyles.mealTypeSaveButton}
                      aria-busy={preferencesBusy}
                      type="button"
                      disabled={
                        preferencesBusy || !typeDraftDirty || !mealTypeDraft.visibleMealTypes.length
                      }
                      onClick={() => void saveMealTypePreferences()}
                    >
                      {preferencesBusy && <ButtonSpinner />}
                      {preferencesBusy ? 'Saving…' : 'Save meal types'}
                    </button>
                    <button
                      type="button"
                      disabled={preferencesBusy}
                      onClick={() => {
                        setMealTypeDraft(mealTypePreferences);
                        setMealTypeSettingsOpen(false);
                      }}
                    >
                      Cancel type changes
                    </button>
                  </div>
                ) : null}
                <div className={settingsStyles.mealChoices}>
                  {scheduleMeals.map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={selectedMeals.includes(option.value)}
                        onChange={() => toggleMeal(option.value)}
                      />
                      <span className={settingsStyles.checkMark} aria-hidden="true">
                        {selectedMeals.includes(option.value) ? <Check size={15} /> : null}
                      </span>
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={settingsStyles.setupStep}>
                <legend>
                  <span>3</span>
                  <span className={settingsStyles.stepTitle}>Who&apos;s eating?</span>
                  <Link
                    className={settingsStyles.legendAction}
                    href={`/settings/profiles?plannerReturn=${encodeURIComponent(`/planner?view=${viewMode}&date=${selectedMobileDate}`)}`}
                  >
                    Manage people
                  </Link>
                </legend>
                {profiles.length ? (
                  <div className={settingsStyles.profileChoiceWrap}>
                    <div className={settingsStyles.profileChoices}>
                      {profiles.map((profile) => {
                        const selected = selectedProfileIds.includes(profile.id);
                        return (
                          <label key={profile.id}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleProfile(profile.id)}
                            />
                            <span className={settingsStyles.profileAvatar} aria-hidden="true">
                              {profileInitial(profile.displayName)}
                            </span>
                            <span>{profile.displayName}</span>
                            {selected ? (
                              <span className={settingsStyles.profileRemove} aria-hidden="true">
                                <X size={17} />
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className={settingsStyles.setupHint}>
                    <CircleUserRound size={18} aria-hidden="true" />
                    <Link href="/settings/profiles">
                      Add a household profile to start planning.
                    </Link>
                  </p>
                )}
              </fieldset>
            </div>
            <div className={settingsStyles.setupFooter}>
              <p>
                <UsersRound size={18} aria-hidden="true" />
                <span>
                  {selectedProfiles.length} {selectedProfiles.length === 1 ? 'person' : 'people'} ·{' '}
                  {selectedProfiles.length} {selectedProfiles.length === 1 ? 'serving' : 'servings'}{' '}
                  by default for new meals
                </span>
              </p>
              <div className={settingsStyles.autoPlanAction}>
                <button
                  type="button"
                  disabled={!setupValid || mealTypeSettingsOpen || unconfirmedChange}
                  onClick={() => {
                    setSettingsOpen(false);
                    setPickerContext(null);
                    setSelectorOpen(true);
                  }}
                >
                  Choose meals for range
                </button>
                <button
                  type="button"
                  disabled={!setupValid || mealTypeSettingsOpen || unconfirmedChange}
                  className={settingsStyles.generateButton}
                  onClick={() => openGenerator(true)}
                >
                  Generate meal plan
                </button>
                {!setupValid ? (
                  <p role="status">
                    {rangeError ??
                      (!selectedMeals.length || selectedMeals.length > 5
                        ? 'Choose 1 to 5 meal types for generation.'
                        : 'Choose at least one person.')}
                  </p>
                ) : null}
              </div>
              <button
                className={settingsStyles.doneButton}
                type="button"
                disabled={preferencesBusy}
                onClick={closeSettings}
              >
                Close settings
              </button>
            </div>
          </AppDialog>
        )}

        <section
          className={`${styles.weekPlan} planner-workspace-center`}
          aria-label="Meal calendar"
        >
          {feedback ? (
            <div className={styles.feedback} role="status">
              <Check size={18} aria-hidden="true" /> {feedback}
              {feedbackDestination ? (
                <Link
                  className="inline-link"
                  href={`/planner?view=day&date=${feedbackDestination.date}`}
                >
                  {feedbackDestination.label}
                </Link>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}{' '}
              {unconfirmedChange ? (
                <button type="button" onClick={() => window.location.reload()}>
                  Refresh calendar
                </button>
              ) : null}
            </p>
          ) : null}

          <section className={styles.mobilePlannerCommand} aria-label="Mobile planner controls">
            <h2 className="sr-only">
              Plan meals for{' '}
              {formatPlannerDate(selectedMobileDate, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            <div className={styles.mobilePlannerPeriod}>
              <div className={styles.mobileDateBadge} aria-hidden="true">
                <span>{formatPlannerDate(selectedMobileDate, { weekday: 'short' })}</span>
                <strong>{formatPlannerDate(selectedMobileDate, { day: 'numeric' })}</strong>
              </div>
              <div className={styles.mobilePeriodControls}>
                <div
                  className={styles.mobileViewModeControl}
                  role="group"
                  aria-label="Planner view"
                >
                  {(['day', 'week', 'month'] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={viewMode === mode}
                      onClick={() => navigatePeriod(selectedMobileDate, mode)}
                    >
                      {mode.charAt(0).toLocaleUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                <div className={styles.mobilePeriodNavigation}>
                  <button
                    type="button"
                    aria-label={`Previous ${viewMode}`}
                    title={`Previous ${viewMode}`}
                    onClick={() => navigateMobilePeriod(-1)}
                  >
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>
                  <span>
                    {viewMode === 'day'
                      ? formatPlannerDate(selectedMobileDate, { month: 'long', year: 'numeric' })
                      : viewMode === 'month'
                        ? formatPlannerDate(weekStart, { month: 'long', year: 'numeric' })
                        : humanRange(weekStart, weekEnd)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Next ${viewMode}`}
                    title={`Next ${viewMode}`}
                    onClick={() => navigateMobilePeriod(1)}
                  >
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.mobileDateTools}>
              <button type="button" onClick={() => navigatePeriod(today)}>
                Today
              </button>
              <label>
                Go to date
                <input
                  type="date"
                  value={selectedMobileDate}
                  onChange={(event) => {
                    if (event.target.value) navigatePeriod(event.target.value);
                  }}
                />
              </label>
            </div>
            {viewMode !== 'day' ? (
              <div
                className={viewMode === 'month' ? styles.mobileMonthDates : styles.mobileWeekDates}
                role="group"
                aria-label={`Choose a date in this ${viewMode}`}
              >
                {viewMode === 'month'
                  ? monthWeekdayLabels.map((label) => (
                      <span key={label} aria-hidden="true">
                        {label}
                      </span>
                    ))
                  : null}
                {viewMode === 'month'
                  ? Array.from({ length: monthLeadingDays }, (_, index) => (
                      <span key={`blank-${index}`} />
                    ))
                  : null}
                {dates.map((date) => (
                  <button
                    type="button"
                    key={date}
                    aria-pressed={date === selectedMobileDate}
                    aria-current={date === today ? 'date' : undefined}
                    aria-label={`${formatPlannerDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${meals.filter((meal) => meal.plannedFor === date).length} meals${date === today ? ', today' : ''}`}
                    onClick={() => selectCalendarDate(date)}
                  >
                    {viewMode === 'week' ? (
                      <small>{formatPlannerDate(date, { weekday: 'short' })}</small>
                    ) : null}
                    <strong>{formatPlannerDate(date, { day: 'numeric' })}</strong>
                    <span aria-hidden="true">
                      {meals.some((meal) => meal.plannedFor === date) ? '•' : ' '}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className={styles.mobileCommandActions}>
              <div className={styles.mobileHistoryControls} aria-label="Planner save history">
                <button
                  type="button"
                  disabled={!undoStack.length || Boolean(busyAction) || unconfirmedChange}
                  aria-label="Undo last planner change"
                  title={undoStack.length ? `Undo ${undoStack.at(-1)?.label}` : 'Nothing to undo'}
                  onClick={() => void runHistory('undo')}
                >
                  <Undo2 size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!redoStack.length || Boolean(busyAction) || unconfirmedChange}
                  aria-label="Redo last planner change"
                  title={redoStack.length ? `Redo ${redoStack.at(-1)?.label}` : 'Nothing to redo'}
                  onClick={() => void runHistory('redo')}
                >
                  <Redo2 size={18} aria-hidden="true" />
                </button>
                <span role="status" className={styles.saveStatus}>
                  {busyAction
                    ? 'Saving…'
                    : error || unconfirmedChange
                      ? 'Needs attention'
                      : 'Saved'}
                </span>
              </div>

              <button
                className={styles.mobileNutritionAction}
                type="button"
                aria-expanded={mobileNutritionOpen}
                aria-controls="mobile-nutrition-panel"
                aria-label={`${mobileNutritionOpen ? 'Hide' : 'Show'} plan overview`}
                title={`${mobileNutritionOpen ? 'Hide' : 'Show'} nutrition and Pantry details`}
                onClick={() => setMobileNutritionOpen((current) => !current)}
              >
                <Salad size={19} aria-hidden="true" /> <span>Plan overview</span>
              </button>
              <button
                className={styles.mobileAddButton}
                type="button"
                disabled={!setupValid}
                onClick={() => openGenerator()}
              >
                Generate meal plan
              </button>
            </div>
          </section>

          {mobileNutritionOpen ? (
            <div
              id="mobile-nutrition-panel"
              className={styles.mobileInsights}
              aria-label="Nutrition and Pantry details"
            >
              <KitchenPrintDialog kind="meal-plan" start={weekStart} end={weekEnd} />
              <NutritionPreview
                nutrition={nutrition}
                profileName={nutritionProfileName}
                period={humanRange(weekStart, weekEnd)}
                busy={summaryBusy}
              />
              <PantryPreview
                summary={pantrySummary}
                meals={meals.length}
                period={humanRange(weekStart, weekEnd)}
                busy={summaryBusy}
                generating={busyAction === 'shopping-list'}
                onGenerate={() => void generateList()}
              />
              <button type="button" onClick={() => setMobileReviewOpen(true)}>
                Compare saved recipes
              </button>
              {viewMode === 'week' ? (
                <button
                  type="button"
                  disabled={Boolean(busyAction) || unconfirmedChange || !meals.length}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Add copies to ${humanRange(nextWeekStart, addPlannerDays(nextWeekStart, 6))}? Existing meals stay; copies start as planned. This action has no Undo.`,
                      )
                    )
                      void copyWeek();
                  }}
                >
                  Copy to next week
                </button>
              ) : null}
              {initialAiSummary ? (
                <details className={styles.planningNotes}>
                  <summary className="recipe-disclosure-summary">
                    <span>AI planning summary</span>
                    <ChevronDown size={18} />
                  </summary>
                  <p>
                    Saved planning insight
                    {initialAiSummary.periodStart && initialAiSummary.periodEnd
                      ? ` for ${humanRange(initialAiSummary.periodStart, initialAiSummary.periodEnd)}`
                      : ''}
                    . This snapshot does not follow the visible calendar.
                  </p>
                  <AiSummaryCards
                    domain="meal_plans"
                    placement="rail"
                    initialSummary={initialAiSummary}
                  />
                </details>
              ) : null}
            </div>
          ) : null}

          {viewMode === 'month' ? (
            <div className={styles.monthSchedule}>
              {monthWeekdayLabels.map((label) => (
                <strong className={styles.monthWeekday} key={label}>
                  {label}
                </strong>
              ))}
              {Array.from({ length: monthLeadingDays }, (_, index) => (
                <span className={styles.monthBlankDay} aria-hidden="true" key={`blank-${index}`} />
              ))}
              {dates.map((date) => {
                const dayMeals = meals.filter((meal) => meal.plannedFor === date);
                return (
                  <section
                    className={`${styles.monthDay} ${date === today ? styles.currentMonthDay : ''}`}
                    key={date}
                  >
                    <header>
                      <button
                        type="button"
                        aria-current={date === today ? 'date' : undefined}
                        aria-label={`Open ${formatPlannerDate(date, { month: 'long', day: 'numeric', year: 'numeric' })} day view`}
                        onClick={() => navigatePeriod(date, 'day')}
                      >
                        {formatPlannerDate(date, { day: 'numeric' })}
                      </button>
                      <button
                        type="button"
                        aria-label={`Add recipe on ${formatPlannerDate(date, { month: 'long', day: 'numeric' })}`}
                        onClick={() => openRecipePicker(date)}
                      >
                        <Plus size={15} aria-hidden="true" />
                      </button>
                    </header>
                    <div>
                      {dayMeals.slice(0, 2).map((meal) => (
                        <button
                          type="button"
                          key={meal.id}
                          onClick={() => navigatePeriod(date, 'day')}
                        >
                          <span>{mealTypeLabel(meal.meal, mealTypeOptions)}</span>
                          <strong>{meal.recipeTitle}</strong>
                        </button>
                      ))}
                      {dayMeals.length > 0 ? (
                        <button type="button" onClick={() => navigatePeriod(date, 'day')}>
                          {dayMeals.length === 1
                            ? 'View 1 meal'
                            : `View all ${dayMeals.length} meals`}
                        </button>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div
              className={styles.desktopSchedule}
              style={{ '--planner-columns': dates.length } as CSSProperties}
            >
              <div className={styles.scheduleCorner} aria-hidden="true" />
              {dates.map((date) => (
                <div
                  className={`${styles.dayHeading} ${date === today ? styles.currentDay : ''}`}
                  key={date}
                >
                  <strong>{formatPlannerDate(date, { weekday: 'short' })}</strong>
                  <span>{formatPlannerDate(date, { month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
              {scheduleMeals.map((option, rowIndex) => (
                <div className={styles.scheduleRow} key={option.value}>
                  <div
                    className={`${styles.mealHeading} ${rowIndex % 2 ? styles.alternateCell : ''}`}
                  >
                    <MealTypeIcon meal={option.value} /> {option.label}
                  </div>
                  {dates.map((date) => {
                    const slotMeals = meals.filter(
                      (meal) => meal.plannedFor === date && meal.meal === option.value,
                    );
                    return (
                      <div
                        className={`${styles.scheduleSlot} ${rowIndex % 2 ? styles.alternateCell : ''} ${date === today ? styles.currentDay : ''}`}
                        key={`${date}-${option.value}`}
                        data-planner-slot={slotMeals.length ? `${date}:${option.value}` : undefined}
                        tabIndex={slotMeals.length ? 0 : -1}
                        onKeyDown={(event) => handleSlotKeyDown(event, date, option.value)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(date, option.value, slotMeals[0])}
                      >
                        {slotMeals.length ? (
                          slotMeals.map((meal) => (
                            <PlannedMealCard
                              compact={viewMode === 'week'}
                              profiles={profiles}
                              key={meal.id}
                              meal={meal}
                              recipes={recipes}
                              busy={Boolean(busyAction)}
                              unconfirmed={unconfirmedChange}
                              pantryStatus={pantryStatusByMeal[meal.id] ?? 'unknown'}
                              onActions={setActiveMealActions}
                              onServings={(entry, servings) =>
                                void updateMealEntry(entry, { servings }, 'Serving count updated.')
                              }
                              onDragStart={setDraggedMealId}
                            />
                          ))
                        ) : (
                          <button
                            className={styles.emptySlot}
                            type="button"
                            data-planner-slot={`${date}:${option.value}`}
                            aria-label={`Choose ${option.label.toLocaleLowerCase()} for ${formatPlannerDate(date, { month: 'long', day: 'numeric' })}`}
                            title={`Add ${option.label.toLocaleLowerCase()} for ${formatPlannerDate(date, { weekday: 'long' })}`}
                            onKeyDown={(event) => handleSlotKeyDown(event, date, option.value)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => handleDrop(date, option.value)}
                            onClick={() => openRecipePicker(date, option.value)}
                          >
                            <Plus size={18} aria-hidden="true" />
                            <span>Add meal</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className={styles.mobileSchedule}>
            <h2 aria-live="polite">
              {formatPlannerDate(selectedMobileDate, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </h2>
            {scheduleMeals.map((option) => {
              const slotMeals = selectedDayMeals.filter((meal) => meal.meal === option.value);
              return (
                <section
                  className={!slotMeals.length ? styles.emptyMobileMeal : undefined}
                  key={option.value}
                >
                  <div className={styles.mobileMealLabel}>
                    <span aria-hidden="true">
                      <MealTypeIcon meal={option.value} />
                    </span>
                    <strong>{option.label}</strong>
                  </div>
                  <div className={styles.mobileMealContent}>
                    {slotMeals.length ? (
                      slotMeals.map((meal) => (
                        <PlannedMealCard
                          profiles={profiles}
                          key={meal.id}
                          meal={meal}
                          recipes={recipes}
                          busy={Boolean(busyAction)}
                          unconfirmed={unconfirmedChange}
                          pantryStatus={pantryStatusByMeal[meal.id] ?? 'unknown'}
                          onActions={setActiveMealActions}
                          onServings={(entry, servings) =>
                            void updateMealEntry(entry, { servings }, 'Serving count updated.')
                          }
                          onDragStart={setDraggedMealId}
                        />
                      ))
                    ) : (
                      <button
                        type="button"
                        onClick={() => openRecipePicker(selectedMobileDate, option.value)}
                      >
                        <Plus size={25} aria-hidden="true" /> Add meal
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <aside className={styles.insightsRail} aria-label="Plan overview and shopping">
          <section
            className={styles.insightCard}
            aria-label={`${mealLabel(viewMode)} plan at a glance`}
          >
            <header className={styles.planOverviewHeader}>
              <span className={styles.planOverviewIcon} aria-hidden="true">
                <CalendarDays size={18} />
              </span>
              <div>
                <h2>Plan overview</h2>
                <small>Your current calendar at a glance</small>
              </div>
            </header>
            <div className={styles.planOverviewMetrics} aria-live="polite">
              <div>
                <strong>{meals.length}</strong>
                <span>Meals planned</span>
              </div>
              <div>
                <strong>{totalServings}</strong>
                <span>Total servings</span>
              </div>
              <div>
                <strong>{recipesUsed}</strong>
                <span>Recipes used</span>
              </div>
            </div>
          </section>{' '}
          <PantryPreview
            summary={pantrySummary}
            meals={meals.length}
            period={humanRange(weekStart, weekEnd)}
            busy={summaryBusy}
            generating={busyAction === 'shopping-list'}
            onGenerate={() => void generateList()}
          />
          <NutritionPreview
            nutrition={nutrition}
            profileName={nutritionProfileName}
            period={humanRange(weekStart, weekEnd)}
            busy={summaryBusy}
          />
          <section className={styles.assistanceSection} aria-label="Meal suggestions">
            <DecisionAssistance
              headingLevel={3}
              embedded
              initialTask="meal_rank"
              tasks={['meal_rank']}
              title="Find a meal"
              description="Compare saved recipes using permitted profile and pantry information. Remembering a choice records your assessment; add a meal separately to schedule it."
            />
          </section>
          {initialAiSummary && (
            <details className={styles.planningNotes}>
              <summary className="recipe-disclosure-summary">
                <span>AI planning summary</span>
                <ChevronDown size={18} />
              </summary>
              <p>
                Saved planning insight
                {initialAiSummary.periodStart && initialAiSummary.periodEnd
                  ? ` for ${humanRange(initialAiSummary.periodStart, initialAiSummary.periodEnd)}`
                  : ''}
                . This snapshot does not follow the visible calendar.
              </p>

              {initialAiSummary ? (
                <AiSummaryCards
                  domain="meal_plans"
                  placement="rail"
                  initialSummary={initialAiSummary}
                />
              ) : null}
            </details>
          )}
        </aside>
      </div>

      {actionMeal ? (
        <PlannedMealActions
          key={`${actionMeal.id}:${actionMeal.plannedFor}:${actionMeal.meal}`}
          meal={actionMeal}
          busy={Boolean(busyAction)}
          unconfirmed={unconfirmedChange}
          dates={dates}
          weekMeals={meals}
          mealTypes={scheduleMeals}
          pantryStatus={pantryStatusByMeal[actionMeal.id] ?? 'unknown'}
          onClose={closeMealActions}
          onRemove={removeMeal}
          onRefreshRecipe={refreshPlannedRecipe}
          onEdit={(entry) => {
            setActiveMealActions(null);
            setMealEditor({ entry });
          }}
          onStatus={updateMealStatus}
          onDuplicate={(entry) => void duplicateMeal(entry)}
          onMove={(entry, date, meal) =>
            void updateMealEntry(
              entry,
              { plannedFor: date, meal },
              `Meal moved to ${formatPlannerDate(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} · ${mealTypeLabel(meal, mealTypeOptions)}.`,
            )
          }
          onSwap={(entry, target) => void swapMeals(entry, target)}
        />
      ) : null}
      <AiMealPlanGenerator
        weekStart={startDate}
        weekEnd={selectedPlanEnd}
        mealSlots={selectedMeals}
        profiles={selectedProfiles}
        disabled={!setupValid}
        mealTypeOptions={mealTypeOptions}
        aiModel={aiMealPlanModel}
        imageGenerationEnabled={aiImageGenerationEnabled}
        open={generatorOpen}
        onOpenChange={(open) => {
          setGeneratorOpen(open);
          if (!open && generatorReturnToSettings) setSettingsOpen(true);
        }}
        onEditSettings={() => {
          setGeneratorOpen(false);
          setSettingsOpen(true);
        }}
        hideTrigger
      />
      {mobileReviewOpen ? (
        <AppDialog
          aria-labelledby="planner-meal-review-title"
          onClose={() => setMobileReviewOpen(false)}
          className={styles.reviewDialog}
        >
          <header>
            <h2 id="planner-meal-review-title">Compare saved recipes</h2>
            <button
              type="button"
              aria-label="Close meal comparison"
              onClick={() => setMobileReviewOpen(false)}
            >
              <X />
            </button>
          </header>
          <div>
            <p>
              Ranks saved recipes using permitted profile and Pantry information. Remembering an
              assessment does not schedule a meal.
            </p>
            <DecisionAssistance
              headingLevel={3}
              embedded
              initiallyExpanded
              hideContextHeader
              initialTask="meal_rank"
              tasks={['meal_rank']}
              title="Find a meal"
              description="Ranks saved recipes using permitted profile and pantry information. Remembering a choice records your assessment; add a meal separately to schedule it."
            />
          </div>
        </AppDialog>
      ) : null}
      {mealEditor ? (
        <MealEntryEditor
          profiles={profiles}
          initialProfileIds={
            selectedProfileIds.length === profiles.length ? [] : selectedProfileIds
          }
          entry={mealEditor.entry}
          initialKind={mealEditor.kind}
          recipes={recipes.map(({ id, title }) => ({ id, title }))}
          date={mealEditor.target?.date ?? pickerContext?.date ?? startDate}
          slot={mealEditor.target?.meal ?? pickerContext?.meal ?? selectedMeals[0] ?? 'dinner'}
          mealTypeOptions={mealTypeOptions}
          slots={selectedMeals}
          meals={meals}
          servings={selectedProfiles.length}
          onClose={() => {
            if (mealEditor.target && !editorCommittedRef.current) setSelectorOpen(true);
            if (mealEditor.entry) returnToMealAction(mealEditor.entry.id);
            setMealEditor(null);
          }}
          onUncertain={() => {
            editorCommittedRef.current = true;
            setUnconfirmedChange(true);
            setError('A meal save could not be confirmed. Check the calendar before trying again.');
          }}
          onSaved={(context) => {
            editorCommittedRef.current = true;
            setError(null);
            setFeedback(
              `Meal saved for ${formatPlannerDate(context.date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} · ${mealTypeLabel(context.meal, mealTypeOptions)}.`,
            );
            if (context.date < weekStart || context.date > weekEnd)
              setFeedbackDestination({ date: context.date, label: 'View saved meal' });
            setUndoStack([]);
            setRedoStack([]);
            router.refresh();
          }}
        />
      ) : null}
      <MealPlanRecipeSelector
        onOtherKind={(kind, context) => {
          editorCommittedRef.current = false;
          setSelectorOpen(false);
          setMealEditor({ kind, target: context });
        }}
        key={`${startDate}-${duration}-${selectedMeals.join('-')}-${pickerContext?.date ?? ''}-${pickerContext?.meal ?? ''}`}
        open={selectorOpen}
        startDate={pickerContext?.date ?? startDate}
        duration={pickerContext ? 1 : duration}
        mealTypes={
          pickerContext && !selectedMeals.includes(pickerContext.meal)
            ? [...selectedMeals, pickerContext.meal]
            : selectedMeals
        }
        mealTypeOptions={mealTypeOptions}
        recipes={recipes}
        collections={collections}
        collectionMemberships={collectionMemberships}
        servings={selectedProfiles.length}
        profileIds={selectedProfileIds.length === profiles.length ? [] : selectedProfileIds}
        profileNames={selectedProfiles.map((profile) => profile.displayName)}
        initialDate={pickerContext?.date}
        initialMealType={pickerContext?.meal}
        onUncertain={() => {
          setUnconfirmedChange(true);
          setError(
            'An addition could not be confirmed. Check the calendar before submitting it again.',
          );
        }}
        onClose={() => setSelectorOpen(false)}
        onSaved={handleRecipesSaved}
      />
    </>
  );
}
