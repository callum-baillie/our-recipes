'use client';

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
  GripVertical,
  Move,
  Plus,
  Printer,
  Redo2,
  Salad,
  Save,
  SlidersHorizontal,
  ShoppingBasket,
  Trash2,
  Undo2,
  Utensils,
  UsersRound,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { AiMealPlanGenerator } from '@/components/ai-meal-plan-generator';
import { MealPlanRecipeSelector } from '@/components/meal-plan-recipe-selector';
import { InlineSkeleton } from '@/components/skeleton';
import {
  addPlannerDays,
  formatPlannerDate,
  MEAL_OPTIONS,
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
  nutritionByDate?: Record<string, Record<string, number>>;
  nutritionGoals?: Array<{
    nutrientCode: string;
    kind: 'target' | 'minimum' | 'range' | 'limit';
    value: number | null;
    minimum: number | null;
    maximum: number | null;
  }>;
  pantrySummary?: { covered: number; total: number; missing: number };
  pantryStatusByMeal?: Record<string, 'covered' | 'shortage' | 'uncertain' | 'unknown'>;
  defaultDuration?: 3 | 5 | 7 | 14;
  defaultMealTypes?: MealType[];
  mealPlanPreferences?: MealPlanPreferences;
  viewMode?: 'day' | 'week' | 'month';
  weekStartsOn?: 0 | 1;
  aiMealPlanModel?: string;
  aiImageGenerationEnabled?: boolean;
};

type MealEntrySnapshot = {
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

function mealLabel(meal: string): string {
  return mealTypeLabel(meal);
}

function humanRange(start: string, end: string): string {
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
  return goal.value;
}

function number(value: number | undefined, maximumFractionDigits = 0): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function recipeForMeal(meal: PlannedMeal, recipes: RecipeListItem[]) {
  return meal.recipeId ? (recipes.find((item) => item.id === meal.recipeId) ?? null) : null;
}

function mealEntrySnapshot(meal: PlannedMeal): MealEntrySnapshot {
  return {
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
      <span className={styles.mealPlaceholder} aria-hidden="true">
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
      sizes="96px"
    />
  );
}

function PlannedMealCard({
  meal,
  recipes,
  busy,
  dates,
  weekMeals,
  pantryStatus,
  onRemove,
  onRefreshRecipe,
  onStatus,
  onServings,
  onDuplicate,
  onMove,
  onSwap,
  onDragStart,
}: {
  meal: PlannedMeal;
  recipes: RecipeListItem[];
  busy: boolean;
  dates: string[];
  weekMeals: PlannedMeal[];
  pantryStatus: 'covered' | 'shortage' | 'uncertain' | 'unknown';
  onRemove: (id: string) => void;
  onRefreshRecipe: (id: string) => void;
  onStatus: (id: string, status: 'planned' | 'skipped' | 'cancelled') => void;
  onServings: (meal: PlannedMeal, servings: number) => void;
  onDuplicate: (meal: PlannedMeal) => void;
  onMove: (meal: PlannedMeal, date: string, mealType: MealType) => void;
  onSwap: (meal: PlannedMeal, target: PlannedMeal) => void;
  onDragStart: (mealId: string) => void;
}) {
  const recipe = recipeForMeal(meal, recipes);
  const totalMinutes = recipe ? recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes : null;
  const [moveTarget, setMoveTarget] = useState(`${meal.plannedFor}:${meal.meal}`);
  const [swapTarget, setSwapTarget] = useState('');
  const pantryLabel = {
    covered: 'Pantry covered',
    shortage: 'Pantry items missing',
    uncertain: 'Pantry coverage uncertain',
    unknown: 'Pantry coverage not calculated',
  }[pantryStatus];

  return (
    <article
      className={styles.plannedMeal}
      draggable={!busy}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', meal.id);
        onDragStart(meal.id);
      }}
    >
      <div className={styles.mealThumb}>
        <MealThumbnail meal={meal} recipes={recipes} />
      </div>
      <div className={styles.plannedMealCopy}>
        <div className={styles.mealTitleRow}>
          <strong>{meal.recipeTitle}</strong>
          <span
            className={`${styles.pantryDot} ${styles[`pantryDot${pantryStatus}`]}`}
            title={pantryLabel}
          >
            <span className="sr-only">{pantryLabel}</span>
          </span>
        </div>
        <span className={styles.mealMeta}>
          <label className={styles.servingEditor} title="Edit servings">
            <UsersRound size={13} aria-hidden="true" />
            <input
              key={`${meal.id}-${meal.servings}-${meal.updatedAt instanceof Date ? meal.updatedAt.toISOString() : meal.updatedAt}`}
              aria-label={`Servings for ${meal.recipeTitle}`}
              type="number"
              min={1}
              max={100}
              defaultValue={meal.servings}
              disabled={busy}
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
            <>
              <Clock3 size={13} aria-hidden="true" /> {totalMinutes}m
            </>
          ) : null}
        </span>
      </div>
      <details className={styles.mealActions}>
        <summary aria-label={`Actions for ${meal.recipeTitle}`} title="Meal actions">
          <Ellipsis size={17} aria-hidden="true" />
        </summary>
        <div>
          <span className={styles.dragHint}>
            <GripVertical size={14} aria-hidden="true" /> Drag to move or swap
          </span>
          <button type="button" disabled={busy} onClick={() => onDuplicate(meal)}>
            <CopyPlus size={14} aria-hidden="true" /> Duplicate to next day
          </button>
          <label>
            <span>
              <Move size={14} aria-hidden="true" /> Move to
            </span>
            <select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
              {dates.flatMap((date) =>
                MEAL_OPTIONS.map((option) => (
                  <option key={`${date}:${option.value}`} value={`${date}:${option.value}`}>
                    {formatPlannerDate(date, { weekday: 'short' })} · {option.label}
                  </option>
                )),
              )}
            </select>
            <button
              type="button"
              disabled={busy || moveTarget === `${meal.plannedFor}:${meal.meal}`}
              onClick={() => {
                const [date, mealType] = moveTarget.split(':') as [string, MealType];
                onMove(meal, date, mealType);
              }}
            >
              Move
            </button>
          </label>
          <label>
            <span>
              <ArrowRightLeft size={14} aria-hidden="true" /> Swap with
            </span>
            <select value={swapTarget} onChange={(event) => setSwapTarget(event.target.value)}>
              <option value="">Choose a meal</option>
              {weekMeals
                .filter((candidate) => candidate.id !== meal.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {formatPlannerDate(candidate.plannedFor, { weekday: 'short' })} ·{' '}
                    {mealLabel(candidate.meal)} · {candidate.recipeTitle}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={busy || !swapTarget}
              onClick={() => {
                const target = weekMeals.find((candidate) => candidate.id === swapTarget);
                if (target) onSwap(meal, target);
              }}
            >
              Swap
            </button>
          </label>
          {meal.effectiveStatus === 'cooked' ? (
            <span>Cooked</span>
          ) : (
            <label>
              <span>Status</span>
              <select
                aria-label={`Status for ${meal.recipeTitle}`}
                value={meal.status}
                disabled={busy}
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
          {meal.recipeId && meal.status === 'planned' && meal.effectiveStatus !== 'cooked' ? (
            <Link
              href={`/recipes/${meal.recipeId}/cook?mealPlanEntryId=${meal.id}`}
              aria-label={`Cook ${meal.recipeTitle} from this planned meal`}
            >
              Cook
            </Link>
          ) : null}
          {meal.recipeChangedSincePlanning ? (
            <button type="button" disabled={busy} onClick={() => onRefreshRecipe(meal.id)}>
              Refresh recipe
            </button>
          ) : null}
          <button
            className={styles.destructiveAction}
            type="button"
            disabled={busy}
            onClick={() => onRemove(meal.id)}
          >
            <Trash2 size={14} aria-hidden="true" /> Remove
          </button>
        </div>
      </details>
    </article>
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
  previousWeekStart,
  nextWeekStart,
  today = weekStart,
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
}: MealPlannerProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(
    () => plannerDates(weekStart, defaultDuration).at(-1) ?? weekEnd,
  );
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [mealTypeSettingsOpen, setMealTypeSettingsOpen] = useState(false);
  const [mealTypePreferences, setMealTypePreferences] = useState(mealPlanPreferences);
  const [customMealName, setCustomMealName] = useState('');
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState<MealType[]>(defaultMealTypes);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(() =>
    profiles.map((profile) => profile.id),
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState<{ date: string; meal: MealType } | null>(null);
  const [draggedMealId, setDraggedMealId] = useState<string | null>(null);
  const [showMobileSetup, setShowMobileSetup] = useState(false);
  const [mobileNutritionOpen, setMobileNutritionOpen] = useState(false);
  const [selectedMobileDate, setSelectedMobileDate] = useState(() => {
    if (today >= weekStart && today <= weekEnd) return today;
    return (
      meals.find((meal) => meal.plannedFor >= weekStart && meal.plannedFor <= weekEnd)
        ?.plannedFor ?? weekStart
    );
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<MealHistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<MealHistoryCommand[]>([]);

  const dates = useMemo(
    () => plannerDates(weekStart, inclusivePlannerDays(weekStart, weekEnd)),
    [weekEnd, weekStart],
  );
  const setupValid = Boolean(startDate && selectedMeals.length && selectedProfileIds.length);
  const selectedProfiles = profiles.filter((profile) => selectedProfileIds.includes(profile.id));
  const duration = inclusivePlannerDays(startDate, endDate);
  const selectedPlanEnd = endDate;
  const mealTypeOptions: MealTypeOption[] = [
    ...MEAL_OPTIONS,
    ...mealTypePreferences.customMealTypes.map((option) => ({
      ...option,
      defaultVisible: false,
    })),
  ];
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
  const nutrientAverage = (code: string) =>
    plannedDays.length
      ? plannedDays.reduce((total, values) => total + (values[code] ?? 0), 0) / plannedDays.length
      : undefined;
  const nutrition = [
    { code: 'energy_kcal', label: 'Calories', unit: 'kcal' },
    { code: 'protein', label: 'Protein', unit: 'g' },
    { code: 'carbohydrate', label: 'Carbs', unit: 'g' },
    { code: 'total_fat', label: 'Fat', unit: 'g' },
  ].map((item) => {
    const value = nutrientAverage(item.code);
    const target = goalBoundary(nutritionGoals.find((goal) => goal.nutrientCode === item.code));
    return {
      ...item,
      value,
      target,
      progress: value !== undefined && target ? Math.min(100, (value / target) * 100) : 0,
    };
  });
  const coveragePercent = pantrySummary.total
    ? Math.round((pantrySummary.covered / pantrySummary.total) * 100)
    : 0;
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

  function recordHistory(command: MealHistoryCommand) {
    setUndoStack((current) => [...current.slice(-19), command]);
    setRedoStack([]);
  }

  async function deleteHistoryEntries(ids: string[]) {
    for (const id of ids) {
      const response = await fetch(`/api/v1/meal-plan/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('A meal changed before it could be removed.');
    }
  }

  async function restoreHistoryEntries(entries: MealEntrySnapshot[]): Promise<string[]> {
    const response = await fetch('/api/v1/meal-plan/batch', {
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
        const response = await fetch(`/api/v1/meal-plan/${command.id}`, {
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
        const response = await fetch(`/api/v1/meal-plan/${command.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: direction === 'undo' ? command.before : command.after }),
        });
        if (!response.ok) throw new Error('That meal status could not be restored.');
        nextCommand = { ...command };
      } else {
        const response = await fetch('/api/v1/meal-plan/swap', {
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

  function confirmSaved() {
    router.refresh();
    setFeedback('All planner changes are saved.');
  }

  function openRecipePicker(
    date = selectedMobileDate,
    meal: MealType = selectedMeals[0] ?? 'dinner',
  ) {
    setPickerContext({ date, meal });
    setSelectorOpen(true);
  }

  function toggleMeal(meal: MealType) {
    setSelectedMeals((current) =>
      current.includes(meal) ? current.filter((item) => item !== meal) : [...current, meal],
    );
  }

  function toggleVisibleMealType(meal: MealType) {
    setMealTypePreferences((current) => {
      const visibleMealTypes = current.visibleMealTypes.includes(meal)
        ? current.visibleMealTypes.filter((item) => item !== meal)
        : [...current.visibleMealTypes, meal];
      return { ...current, visibleMealTypes };
    });
  }

  function addCustomMealType() {
    const label = customMealName.trim();
    if (!label) return;
    const base = label
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '')
      .slice(0, 32);
    if (!base) return;
    let value = `custom-${base}`;
    let suffix = 2;
    while (mealTypeOptions.some((option) => option.value === value)) {
      value = `custom-${base}-${suffix}`;
      suffix += 1;
    }
    setMealTypePreferences((current) => ({
      ...current,
      customMealTypes: [...current.customMealTypes, { value, label }],
      visibleMealTypes: [...current.visibleMealTypes, value],
    }));
    setCustomMealName('');
  }

  function removeCustomMealType(meal: MealType) {
    setMealTypePreferences((current) => ({
      ...current,
      customMealTypes: current.customMealTypes.filter((option) => option.value !== meal),
      visibleMealTypes: current.visibleMealTypes.filter((value) => value !== meal),
      defaultMealTypes: current.defaultMealTypes.filter((value) => value !== meal),
    }));
    setSelectedMeals((current) => current.filter((value) => value !== meal));
  }

  async function saveMealTypePreferences() {
    setPreferencesBusy(true);
    setError(null);
    const response = await fetch('/api/v1/settings/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'mealPlan', values: mealTypePreferences }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setPreferencesBusy(false);
    if (!response.ok) {
      setError(body?.error?.message ?? 'We could not save those meal types.');
      return;
    }
    setSelectedMeals((current) =>
      current.filter((meal) => mealTypePreferences.visibleMealTypes.includes(meal)),
    );
    setMealTypeSettingsOpen(false);
    setFeedback('Meal types saved.');
    router.refresh();
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
      title: meal.recipeId ? '' : meal.title,
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
    setError(null);
    const response = await fetch(`/api/v1/meal-plan/${meal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload(meal, overrides)),
    });
    const body = (await response.json().catch(() => null)) as {
      meal?: PlannedMeal;
      error?: { message?: string };
    } | null;
    setBusyAction(null);
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
    setFeedback(successMessage);
    router.refresh();
  }

  async function duplicateMeal(meal: PlannedMeal) {
    const currentIndex = dates.indexOf(meal.plannedFor);
    const targetDate = dates[Math.min(dates.length - 1, currentIndex + 1)] ?? meal.plannedFor;
    setBusyAction(meal.id);
    setError(null);
    const response = await fetch('/api/v1/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plannedFor: targetDate,
        meal: meal.meal,
        recipeId: meal.recipeId ?? '',
        title: meal.recipeId ? '' : meal.title,
        servings: meal.servings,
        note: meal.note,
      }),
    });
    const body = (await response.json().catch(() => null)) as { meal?: PlannedMeal } | null;
    setBusyAction(null);
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
    setFeedback(`Meal duplicated to ${formatPlannerDate(targetDate, { weekday: 'long' })}.`);
    router.refresh();
  }

  async function swapMeals(source: PlannedMeal, target: PlannedMeal) {
    setBusyAction(source.id);
    setError(null);
    const response = await fetch('/api/v1/meal-plan/swap', {
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
    setBusyAction(null);
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
    setFeedback('Meals swapped.');
    router.refresh();
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
      setSelectedMobileDate(target);
      return;
    }
    navigatePeriod(addPlannerDays(selectedMobileDate, amount), 'day');
  }

  function navigateMobilePeriod(amount: -1 | 1) {
    if (viewMode === 'day') {
      navigateMobileDay(amount);
      return;
    }
    navigatePeriod(amount === -1 ? previousWeekStart : nextWeekStart, viewMode);
  }

  async function copyWeek() {
    setBusyAction('copy');
    setError(null);
    setFeedback(null);
    const response = await fetch('/api/v1/meal-plan/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart, destinationWeekStart: nextWeekStart }),
    });
    setBusyAction(null);
    if (!response.ok) {
      setError('We could not copy this week yet. Try again in a moment.');
      return;
    }
    navigateWeek(nextWeekStart);
  }

  async function removeMeal(id: string) {
    const meal = meals.find((candidate) => candidate.id === id);
    if (!meal || !window.confirm(`Remove ${meal.recipeTitle} from this plan?`)) return;
    setBusyAction(id);
    setError(null);
    const response = await fetch(`/api/v1/meal-plan/${id}`, { method: 'DELETE' });
    setBusyAction(null);
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
    setFeedback('Meal removed from the plan.');
    router.refresh();
  }

  async function updateMealStatus(id: string, status: 'planned' | 'skipped' | 'cancelled') {
    const meal = meals.find((candidate) => candidate.id === id);
    if (!meal || meal.status === status) return;
    setBusyAction(id);
    setError(null);
    const response = await fetch(`/api/v1/meal-plan/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const body = (await response.json().catch(() => null)) as {
      meal?: PlannedMeal;
      error?: { message?: string };
    } | null;
    setBusyAction(null);
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
    setFeedback(`Meal marked ${status}.`);
    router.refresh();
  }

  async function refreshPlannedRecipe(id: string) {
    setBusyAction(id);
    setError(null);
    const response = await fetch(`/api/v1/meal-plan/${id}/refresh-recipe`, { method: 'POST' });
    setBusyAction(null);
    if (!response.ok) {
      setError('We could not refresh that planned recipe. Try again.');
      return;
    }
    setFeedback('The plan now uses the current recipe and Nutrition calculation.');
    router.refresh();
  }

  async function generateList() {
    setBusyAction('shopping-list');
    setError(null);
    setFeedback(null);
    const response = await fetch('/api/v1/shopping-lists/pantry-shortages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart, weekEnd }),
    });
    const body = (await response.json().catch(() => null)) as {
      listId?: string;
      error?: { message?: string };
    } | null;
    setBusyAction(null);
    if (!response.ok || !body?.listId) {
      setError(body?.error?.message ?? 'Plan at least one meal before generating a list.');
      return;
    }
    router.push(`/lists/${body.listId}`);
  }

  function handleRecipesSaved(count: number, addedMeals: PlannedMeal[]) {
    setSelectorOpen(false);
    setShowMobileSetup(false);
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
      <div className={`${styles.plannerLayout} planner-workspace-grid`}>
        <section
          className={`${styles.setupPanel} ${showMobileSetup ? styles.mobileSetupOpen : ''}`}
          aria-label="Build your meal plan"
        >
          <div className={styles.setupHeading}>
            <h2>Plan your week</h2>
            <button
              type="button"
              aria-label="Close plan settings"
              onClick={() => setShowMobileSetup(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <fieldset className={styles.setupStep}>
            <legend>
              <span>1</span> Date range
            </legend>
            <div
              className={styles.dateRangeField}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRangePickerOpen(false);
              }}
            >
              <button
                className={styles.dateRangeVisual}
                type="button"
                aria-expanded={rangePickerOpen}
                aria-controls="planner-date-range-picker"
                onClick={() => setRangePickerOpen((open) => !open)}
              >
                <CalendarDays size={18} />
                <span>{humanRange(startDate, selectedPlanEnd)}</span>
                <ChevronDown
                  className={rangePickerOpen ? styles.dateRangeChevronOpen : undefined}
                  size={18}
                />
              </button>
              {rangePickerOpen ? (
                <div
                  className={styles.dateRangePicker}
                  id="planner-date-range-picker"
                  role="group"
                  aria-label="Choose planning date range"
                >
                  <div className={styles.dateRangeQuickActions} aria-label="Quick date ranges">
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
                      onInput={(event) => {
                        const nextStart = event.currentTarget.value;
                        if (!nextStart) return;
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
                      max={addPlannerDays(startDate, 13)}
                      value={endDate}
                      onInput={(event) => {
                        if (event.currentTarget.value) setEndDate(event.currentTarget.value);
                      }}
                      required
                    />
                  </label>
                  <div className={styles.dateRangePickerFooter}>
                    <span>
                      {duration} {duration === 1 ? 'day' : 'days'} selected
                    </span>
                    <button type="button" onClick={() => setRangePickerOpen(false)}>
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </fieldset>

          <fieldset className={styles.setupStep}>
            <legend>
              <span>2</span>
              <span className={styles.stepTitle}>Meals to plan</span>
              <button
                className={styles.legendAction}
                type="button"
                aria-expanded={mealTypeSettingsOpen}
                aria-controls="planner-meal-type-settings"
                onClick={() => setMealTypeSettingsOpen((open) => !open)}
              >
                Edit types
              </button>
            </legend>
            {mealTypeSettingsOpen ? (
              <div
                className={styles.mealTypeSettings}
                id="planner-meal-type-settings"
                role="group"
                aria-label="Meal types shown in the planner"
              >
                <div className={styles.mealTypeSettingsHeader}>
                  <div>
                    <strong>Meal types</strong>
                    <span>Choose which rows appear in your planner.</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close meal type settings"
                    onClick={() => setMealTypeSettingsOpen(false)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.mealTypeOptionList}>
                  {mealTypeOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={mealTypePreferences.visibleMealTypes.includes(option.value)}
                        onChange={() => toggleVisibleMealType(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        {option.description ? <small>{option.description}</small> : null}
                      </span>
                      {option.value.startsWith('custom-') ? (
                        <button
                          type="button"
                          aria-label={`Remove custom meal type ${option.label}`}
                          onClick={(event) => {
                            event.preventDefault();
                            removeCustomMealType(option.value);
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                    </label>
                  ))}
                </div>
                <div className={styles.customMealTypeForm}>
                  <label>
                    <span>Custom meal type</span>
                    <input
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
                </div>
                <button
                  className={styles.mealTypeSaveButton}
                  type="button"
                  disabled={preferencesBusy || !mealTypePreferences.visibleMealTypes.length}
                  onClick={() => void saveMealTypePreferences()}
                >
                  {preferencesBusy ? 'Saving…' : 'Save meal types'}
                </button>
              </div>
            ) : null}
            <div className={styles.mealChoices}>
              {scheduleMeals.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={selectedMeals.includes(option.value)}
                    onChange={() => toggleMeal(option.value)}
                  />
                  <span className={styles.checkMark} aria-hidden="true">
                    {selectedMeals.includes(option.value) ? <Check size={15} /> : null}
                  </span>
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.setupStep}>
            <legend>
              <span>3</span>
              <span className={styles.stepTitle}>Who&apos;s eating?</span>
              <Link className={styles.legendAction} href="/settings/profiles">
                Add New +
              </Link>
            </legend>
            {profiles.length ? (
              <div className={styles.profileChoiceWrap}>
                <div className={styles.profileChoices}>
                  {profiles.map((profile, index) => {
                    const selected = selectedProfileIds.includes(profile.id);
                    return (
                      <label key={profile.id}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProfile(profile.id)}
                        />
                        <span
                          className={`${styles.profileAvatar} ${styles[`profileAvatar${(index % 4) + 1}`]}`}
                          aria-hidden="true"
                        >
                          {profileInitial(profile.displayName)}
                        </span>
                        <span>{profile.displayName}</span>
                        {selected ? (
                          <span className={styles.profileRemove} aria-hidden="true">
                            <X size={17} />
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className={styles.setupHint}>
                <CircleUserRound size={18} aria-hidden="true" />
                <Link href="/settings/profiles">Add a household profile to start planning.</Link>
              </p>
            )}
          </fieldset>

          <div className={styles.setupFooter}>
            <p className={styles.setupHint}>
              This headcount estimates recipe servings only. Nutrition portions are allocated
              explicitly below and are never split equally by this selection.
            </p>
            <p>
              <UsersRound size={18} aria-hidden="true" />
              <span>
                {selectedProfiles.length} {selectedProfiles.length === 1 ? 'person' : 'people'} ·{' '}
                {selectedProfiles.length} {selectedProfiles.length === 1 ? 'serving' : 'servings'}{' '}
                per meal
              </span>
            </p>
            <div className={styles.autoPlanAction}>
              <AiMealPlanGenerator
                weekStart={startDate}
                weekEnd={selectedPlanEnd}
                mealSlots={selectedMeals}
                profiles={selectedProfiles}
                label="Generate meal plan"
                disabled={!setupValid}
                aiModel={aiMealPlanModel}
                imageGenerationEnabled={aiImageGenerationEnabled}
              />
            </div>
            <p className={styles.setupHint}>
              Start with trusted recipes or create a balanced plan automatically.
            </p>
          </div>
        </section>

        <section
          className={`${styles.weekPlan} planner-workspace-center`}
          aria-labelledby="week-plan-title"
        >
          <header className={styles.weekHeader}>
            <div>
              <h2 id="week-plan-title">
                {viewMode === 'day'
                  ? formatPlannerDate(weekStart, { weekday: 'long' })
                  : viewMode === 'month'
                    ? formatPlannerDate(weekStart, { month: 'long', year: 'numeric' })
                    : 'This week at the table'}
              </h2>
              <p>
                {viewMode === 'day'
                  ? formatPlannerDate(weekStart, { month: 'long', day: 'numeric', year: 'numeric' })
                  : humanRange(weekStart, weekEnd)}
              </p>
            </div>
            <div className={styles.weekControls}>
              <div className={styles.historyControls} aria-label="Planner save history">
                <button
                  type="button"
                  disabled={!undoStack.length || Boolean(busyAction)}
                  title={undoStack.length ? `Undo ${undoStack.at(-1)?.label}` : 'Nothing to undo'}
                  aria-label="Undo last planner change"
                  onClick={() => void runHistory('undo')}
                >
                  <Undo2 size={17} aria-hidden="true" /> <span>Undo</span>
                </button>
                <button
                  type="button"
                  disabled={!redoStack.length || Boolean(busyAction)}
                  title={redoStack.length ? `Redo ${redoStack.at(-1)?.label}` : 'Nothing to redo'}
                  aria-label="Redo last planner change"
                  onClick={() => void runHistory('redo')}
                >
                  <Redo2 size={17} aria-hidden="true" /> <span>Redo</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  title="Planner changes save automatically"
                  aria-label="Confirm planner changes are saved"
                  onClick={confirmSaved}
                >
                  <Save size={17} aria-hidden="true" />
                  <span>{busyAction ? 'Saving' : 'Saved'}</span>
                </button>
              </div>
              <div className={styles.weekNavigation} aria-label="Planner period navigation">
                <button
                  type="button"
                  aria-label={`Previous ${viewMode}`}
                  title={`Previous ${viewMode}`}
                  onClick={() => navigatePeriod(previousWeekStart)}
                >
                  <ChevronLeft size={18} aria-hidden="true" /> <span>Previous</span>
                </button>
                <div className={styles.viewModeControl} role="group" aria-label="Planner view">
                  {(['day', 'week', 'month'] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={viewMode === mode}
                      onClick={() => navigatePeriod(weekStart, mode)}
                    >
                      {mode.charAt(0).toLocaleUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={`Next ${viewMode}`}
                  title={`Next ${viewMode}`}
                  onClick={() => navigatePeriod(nextWeekStart)}
                >
                  <span>Next</span> <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
              <details className={styles.moreActions}>
                <summary title="More planner actions">
                  <Ellipsis size={18} aria-hidden="true" /> More actions
                </summary>
                <div>
                  <button
                    type="button"
                    disabled={viewMode !== 'week' || Boolean(busyAction) || !meals.length}
                    onClick={copyWeek}
                  >
                    <Copy size={16} aria-hidden="true" /> Copy week
                  </button>
                  <a href={`/api/v1/meal-plan/export?start=${weekStart}&end=${weekEnd}`}>
                    <CalendarDays size={16} aria-hidden="true" /> Export calendar
                  </a>
                  <button type="button" onClick={() => window.print()}>
                    <Printer size={16} aria-hidden="true" /> Print plan
                  </button>
                </div>
              </details>
            </div>
          </header>

          {feedback ? (
            <div className={styles.feedback} role="status">
              <Check size={18} aria-hidden="true" /> {feedback}
            </div>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
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
            <div className={styles.mobileCommandActions}>
              <div className={styles.mobileHistoryControls} aria-label="Planner save history">
                <button
                  type="button"
                  disabled={!undoStack.length || Boolean(busyAction)}
                  aria-label="Undo last planner change"
                  title={undoStack.length ? `Undo ${undoStack.at(-1)?.label}` : 'Nothing to undo'}
                  onClick={() => void runHistory('undo')}
                >
                  <Undo2 size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!redoStack.length || Boolean(busyAction)}
                  aria-label="Redo last planner change"
                  title={redoStack.length ? `Redo ${redoStack.at(-1)?.label}` : 'Nothing to redo'}
                  onClick={() => void runHistory('redo')}
                >
                  <Redo2 size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  aria-label="Confirm planner changes are saved"
                  title="Planner changes save automatically"
                  onClick={confirmSaved}
                >
                  <Save size={18} aria-hidden="true" />
                </button>
              </div>
              <button
                className={styles.mobileDayPicker}
                type="button"
                aria-label="Plan settings"
                title="Plan settings"
                onClick={() => setShowMobileSetup(true)}
              >
                <SlidersHorizontal size={19} aria-hidden="true" />
              </button>
              <button
                className={styles.mobileNutritionAction}
                type="button"
                aria-expanded={mobileNutritionOpen}
                aria-controls="mobile-nutrition-panel"
                aria-label={`${mobileNutritionOpen ? 'Hide' : 'Show'} nutrition and Pantry details`}
                title={`${mobileNutritionOpen ? 'Hide' : 'Show'} nutrition and Pantry details`}
                onClick={() => setMobileNutritionOpen((current) => !current)}
              >
                <Salad size={19} aria-hidden="true" /> <span>Nutrition</span>
              </button>
              <AiMealPlanGenerator
                weekStart={startDate}
                weekEnd={selectedPlanEnd}
                mealSlots={selectedMeals}
                profiles={selectedProfiles}
                label="Generate meal plan"
                triggerClassName={styles.mobileAddButton}
                disabled={!setupValid}
                aiModel={aiMealPlanModel}
                imageGenerationEnabled={aiImageGenerationEnabled}
              />
            </div>
          </section>

          {mobileNutritionOpen ? (
            <div
              id="mobile-nutrition-panel"
              className={styles.mobileInsights}
              aria-label="Nutrition and Pantry details"
            >
              <section
                className={styles.mobileNutritionCard}
                aria-labelledby="mobile-nutrition-title"
              >
                <header>
                  <strong id="mobile-nutrition-title">
                    <Salad size={19} aria-hidden="true" /> Nutrition preview
                  </strong>
                  <span>
                    {number(nutrition[0].value)}
                    {nutrition[0].target ? ` / ${number(nutrition[0].target)}` : ''} kcal
                  </span>
                </header>
                {summaryBusy ? (
                  <div className={styles.summarySkeleton} aria-label="Updating nutrition preview">
                    <InlineSkeleton label="Updating nutrition" width="100%" />
                    <InlineSkeleton label="Updating nutrition" width="86%" />
                  </div>
                ) : plannedDays.length ? (
                  <div>
                    {nutrition.map((item) => (
                      <div key={item.code}>
                        <strong>{item.label}</strong>
                        <span>
                          {number(item.value)}
                          {item.target ? ` / ${number(item.target)}` : ''} {item.unit}
                        </span>
                        <i>
                          <b style={{ width: `${item.progress}%` }} />
                        </i>
                        <small>{item.target ? `${Math.round(item.progress)}%` : 'No goal'}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.summaryEmpty}>No nutrition data yet</p>
                )}
              </section>
              <section className={styles.mobilePantryCard} aria-labelledby="mobile-pantry-title">
                {summaryBusy ? (
                  <div className={styles.summarySkeleton} aria-label="Updating Pantry coverage">
                    <InlineSkeleton label="Updating Pantry coverage" width="100%" />
                    <InlineSkeleton label="Updating Pantry coverage" width="72%" />
                  </div>
                ) : meals.length ? (
                  <>
                    <div
                      className={styles.coverageRing}
                      style={{ '--coverage': `${coveragePercent}%` } as CSSProperties}
                    >
                      <span>{coveragePercent}%</span>
                    </div>
                    <p id="mobile-pantry-title">pantry covered</p>
                    <span>{pantrySummary.missing} ingredients missing</span>
                    <Link href="/pantry">
                      View missing items <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <>
                    <p id="mobile-pantry-title" className={styles.summaryEmpty}>
                      Add meals to calculate coverage
                    </p>
                    <button type="button" disabled>
                      View missing items
                    </button>
                  </>
                )}
              </section>
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
                        aria-label={`Open ${formatPlannerDate(date, { month: 'long', day: 'numeric' })} day view`}
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
                      {dayMeals.slice(0, 3).map((meal) => (
                        <button
                          type="button"
                          key={meal.id}
                          onClick={() => navigatePeriod(date, 'day')}
                        >
                          <span>{mealLabel(meal.meal)}</span>
                          <strong>{meal.recipeTitle}</strong>
                        </button>
                      ))}
                      {dayMeals.length > 3 ? <small>+{dayMeals.length - 3} more</small> : null}
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
                    {option.label}
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
                              key={meal.id}
                              meal={meal}
                              recipes={recipes}
                              busy={Boolean(busyAction)}
                              dates={dates}
                              weekMeals={meals}
                              pantryStatus={pantryStatusByMeal[meal.id] ?? 'unknown'}
                              onRemove={removeMeal}
                              onRefreshRecipe={refreshPlannedRecipe}
                              onStatus={updateMealStatus}
                              onServings={(entry, servings) =>
                                void updateMealEntry(entry, { servings }, 'Serving count updated.')
                              }
                              onDuplicate={(entry) => void duplicateMeal(entry)}
                              onMove={(entry, targetDate, targetMeal) =>
                                void updateMealEntry(
                                  entry,
                                  { plannedFor: targetDate, meal: targetMeal },
                                  'Meal moved.',
                                )
                              }
                              onSwap={(entry, target) => void swapMeals(entry, target)}
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
                            <span>Add recipe</span>
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
            {scheduleMeals.map((option) => {
              const slotMeals = selectedDayMeals.filter((meal) => meal.meal === option.value);
              return (
                <section
                  className={!slotMeals.length ? styles.emptyMobileMeal : undefined}
                  key={option.value}
                >
                  <div className={styles.mobileMealLabel}>
                    <span aria-hidden="true">
                      <Utensils size={24} />
                    </span>
                    <strong>{option.label}</strong>
                  </div>
                  <div className={styles.mobileMealContent}>
                    {slotMeals.length ? (
                      slotMeals.map((meal) => (
                        <PlannedMealCard
                          key={meal.id}
                          meal={meal}
                          recipes={recipes}
                          busy={Boolean(busyAction)}
                          dates={dates}
                          weekMeals={meals}
                          pantryStatus={pantryStatusByMeal[meal.id] ?? 'unknown'}
                          onRemove={removeMeal}
                          onRefreshRecipe={refreshPlannedRecipe}
                          onStatus={updateMealStatus}
                          onServings={(entry, servings) =>
                            void updateMealEntry(entry, { servings }, 'Serving count updated.')
                          }
                          onDuplicate={(entry) => void duplicateMeal(entry)}
                          onMove={(entry, targetDate, targetMeal) =>
                            void updateMealEntry(
                              entry,
                              { plannedFor: targetDate, meal: targetMeal },
                              'Meal moved.',
                            )
                          }
                          onSwap={(entry, target) => void swapMeals(entry, target)}
                          onDragStart={setDraggedMealId}
                        />
                      ))
                    ) : (
                      <button
                        type="button"
                        onClick={() => openRecipePicker(selectedMobileDate, option.value)}
                      >
                        <Plus size={25} aria-hidden="true" /> Add recipe
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <aside className={styles.insightsRail} aria-label={`${mealLabel(viewMode)} plan insights`}>
          <section className={styles.insightCard}>
            <header>
              <strong>Nutrition preview</strong>
              <span>Average per day</span>
            </header>
            {summaryBusy ? (
              <div className={styles.summarySkeleton} aria-label="Updating nutrition preview">
                <InlineSkeleton label="Updating nutrition" width="100%" />
                <InlineSkeleton label="Updating nutrition" width="82%" />
                <InlineSkeleton label="Updating nutrition" width="91%" />
              </div>
            ) : plannedDays.length ? (
              nutrition.map((item) => (
                <div className={styles.nutritionLine} key={item.code}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {number(item.value)}
                      {item.target ? ` / ${number(item.target)}` : ''} {item.unit}
                    </small>
                  </span>
                  <i>
                    <b style={{ width: `${item.progress}%` }} />
                  </i>
                </div>
              ))
            ) : (
              <p className={styles.summaryEmpty}>No nutrition data yet</p>
            )}
            <Link href="/nutrition?view=overview">
              View full nutrition <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </section>
          <section className={styles.insightCard}>
            <header>
              <strong>Pantry coverage</strong>
            </header>
            {summaryBusy ? (
              <div className={styles.summarySkeleton} aria-label="Updating Pantry coverage">
                <InlineSkeleton label="Updating Pantry coverage" width="100%" />
                <InlineSkeleton label="Updating Pantry coverage" width="70%" />
              </div>
            ) : meals.length ? (
              <>
                <div className={styles.pantryCoverage}>
                  <div
                    className={styles.coverageRing}
                    style={{ '--coverage': `${coveragePercent}%` } as CSSProperties}
                  />
                  <p>
                    <strong>{coveragePercent}%</strong>
                    <span>covered by pantry</span>
                  </p>
                </div>
                <p className={styles.missingIngredients}>
                  {pantrySummary.missing} ingredients missing
                </p>
                <Link className={styles.railButton} href="/pantry">
                  View missing items
                </Link>
              </>
            ) : (
              <>
                <p className={styles.summaryEmpty}>Add meals to calculate coverage</p>
                <button className={styles.railButton} type="button" disabled>
                  View missing items
                </button>
              </>
            )}
          </section>
          <section
            className={`${styles.insightCard} ${styles.planOverviewCard}`}
            aria-label={`${mealLabel(viewMode)} plan at a glance`}
          >
            <header className={styles.planOverviewHeader}>
              <span className={styles.planOverviewIcon} aria-hidden="true">
                <CalendarDays size={18} />
              </span>
              <span>
                <strong>{mealLabel(viewMode)} summary</strong>
                <small>{humanRange(weekStart, weekEnd)}</small>
              </span>
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
          </section>
          <button
            className={`${styles.shoppingButton} ${styles.railGroceryButton}`}
            type="button"
            disabled={Boolean(busyAction) || !meals.length}
            onClick={generateList}
          >
            {busyAction === 'shopping-list' ? (
              <InlineSkeleton label="Generating shopping list" width="1.1rem" />
            ) : (
              <ShoppingBasket size={17} aria-hidden="true" />
            )}
            <span aria-hidden="true">Make grocery list</span>
            <span className="sr-only">Make Pantry-aware grocery list</span>
          </button>
        </aside>
      </div>

      <MealPlanRecipeSelector
        key={`${startDate}-${duration}-${selectedMeals.join('-')}-${pickerContext?.date ?? ''}-${pickerContext?.meal ?? ''}`}
        open={selectorOpen}
        startDate={pickerContext?.date ?? startDate}
        duration={pickerContext ? 1 : duration}
        mealTypes={
          pickerContext && !selectedMeals.includes(pickerContext.meal)
            ? [...selectedMeals, pickerContext.meal]
            : selectedMeals
        }
        recipes={recipes}
        collections={collections}
        collectionMemberships={collectionMemberships}
        servings={selectedProfiles.length}
        profileNames={selectedProfiles.map((profile) => profile.displayName)}
        initialDate={pickerContext?.date}
        initialMealType={pickerContext?.meal}
        onClose={() => setSelectorOpen(false)}
        onSaved={handleRecipesSaved}
      />
    </>
  );
}
