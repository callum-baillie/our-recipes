'use client';

import { Check, ChefHat, Clock3, Search, X, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useDeferredValue, useMemo, useState } from 'react';

import {
  formatPlannerDate,
  mealTypeLabel,
  plannerDates,
  type MealType,
  type MealTypeOption,
} from '@/components/meal-planner-types';
import styles from '@/components/meal-planner.module.css';
import { AppDialog } from './app-dialog';
import { formatRecipeDuration } from '@/lib/domain/recipe-duration';
import { LoadingIndicator } from '@/components/skeleton';
import type { PlannedMeal } from '@/lib/services/planning-service';
import type { RecipeListItem } from '@/lib/services/recipe-service';

type CollectionOption = { id: string; name: string };
type CollectionMembership = { collectionId: string; recipeId: string };

type RecipeSelectorProps = {
  open: boolean;
  startDate: string;
  duration: number;
  mealTypes: MealType[];
  mealTypeOptions?: MealTypeOption[];
  recipes: RecipeListItem[];
  collections: CollectionOption[];
  collectionMemberships: CollectionMembership[];
  servings: number;
  profileNames: string[];
  profileIds?: string[];
  initialDate?: string;
  initialMealType?: MealType;
  onOtherKind?: (
    kind: 'item' | 'takeout' | 'leftover' | 'fast' | 'options' | 'custom',
    context: { date: string; meal: MealType },
  ) => void;
  onUncertain?: () => void;
  onClose: () => void;
  onSaved: (count: number, meals: PlannedMeal[]) => void;
};

const MEAL_SEARCH_TERMS: Record<string, string[]> = {
  breakfast: ['breakfast', 'brunch', 'morning'],
  lunch: ['lunch', 'salad', 'sandwich'],
  dinner: ['dinner', 'main', 'supper'],
  dessert: ['dessert', 'sweet', 'baking', 'cake'],
  snack: ['snack', 'appetizer', 'side'],
  brunch: ['brunch', 'breakfast', 'lunch'],
  supper: ['supper', 'dinner', 'evening'],
  tiffin: ['tiffin', 'lunch', 'snack'],
  suhoor: ['suhoor', 'sehri', 'breakfast'],
  iftar: ['iftar', 'dinner', 'main'],
};

function slotKey(date: string, meal: MealType): string {
  return `${date}:${meal}`;
}

function recipeMinutes(recipe: RecipeListItem): number {
  return recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes;
}

function RecipeChoiceCard({
  recipe,
  selected,
  onSelect,
  disabled = false,
}: {
  recipe: RecipeListItem;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className={`${styles.recipeChoice}${selected ? ` ${styles.selectedRecipe}` : ''}`}
    >
      <div className={styles.recipeChoiceMedia}>
        {recipe.image ? (
          <Image
            src={`/api/v1/recipes/${recipe.id}/images/${recipe.image.id}`}
            alt={recipe.image.altText || recipe.title}
            width={recipe.image.width}
            height={recipe.image.height}
            sizes="(max-width: 620px) 90vw, 240px"
            unoptimized
          />
        ) : (
          <span aria-hidden="true">
            <ChefHat size={32} />
          </span>
        )}
      </div>
      <div className={styles.recipeChoiceBody}>
        <h3>{recipe.title}</h3>
        <div className={styles.recipeLabels}>
          {[...new Set([recipe.category, ...recipe.tags].filter(Boolean))]
            .slice(0, 3)
            .map((label) => (
              <span key={label}>{label}</span>
            ))}
        </div>
        <p>
          <Clock3 size={14} aria-hidden="true" />{' '}
          {formatRecipeDuration(recipeMinutes(recipe)) ?? 'Time not provided'}
        </p>
        <span className={selected ? styles.selectedButton : styles.secondaryButton}>
          {selected ? <Check size={16} aria-hidden="true" /> : null}
          {selected ? 'Selected' : 'Select'}
        </span>
      </div>
    </button>
  );
}

export function MealPlanRecipeSelector({
  open,
  startDate,
  duration,
  mealTypes,
  mealTypeOptions,
  recipes,
  collections,
  collectionMemberships,
  servings,
  profileNames,
  profileIds = [],
  initialDate,
  initialMealType,
  onClose,
  onUncertain,
  onOtherKind,
  onSaved,
}: RecipeSelectorProps) {
  const labelForMeal = (value: string) => mealTypeLabel(value, mealTypeOptions);
  const dates = useMemo(() => plannerDates(startDate, duration), [duration, startDate]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const [activeMeal, setActiveMeal] = useState<MealType>(
    initialMealType ?? mealTypes[0] ?? 'dinner',
  );
  const [activeSlot, setActiveSlot] = useState(() =>
    dates[0] ? slotKey(initialDate ?? dates[0], initialMealType ?? mealTypes[0] ?? 'dinner') : '',
  );
  const [activeCollection, setActiveCollection] = useState('all');
  const [category, setCategory] = useState('all');
  const [maxMinutes, setMaxMinutes] = useState('any');
  const [showAll, setShowAll] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionNamesByRecipe = useMemo(() => {
    const names = new Map<string, string[]>();
    const collectionNames = new Map(
      collections.map((collection) => [collection.id, collection.name]),
    );
    collectionMemberships.forEach(({ collectionId, recipeId }) => {
      const name = collectionNames.get(collectionId);
      if (name) names.set(recipeId, [...(names.get(recipeId) ?? []), name]);
    });
    return names;
  }, [collectionMemberships, collections]);

  const categories = useMemo(
    () => [...new Set(recipes.map((recipe) => recipe.category).filter(Boolean))].sort(),
    [recipes],
  );

  const filteredRecipes = useMemo(() => {
    const mealTerms = MEAL_SEARCH_TERMS[activeMeal] ?? [activeMeal.replace(/^custom-/u, '')];
    const taggedForMeal = recipes.filter((recipe) => {
      const taxonomy = [recipe.category, ...recipe.tags].join(' ').toLocaleLowerCase();
      return mealTerms.some((term) => taxonomy.includes(term));
    });
    // Meal-aware suggestions are useful before someone searches. Once they
    // type a query, search the whole recipebook so a valid result is never
    // hidden only because its category is not associated with the active meal.
    const mealPool =
      showAll || deferredSearch ? recipes : taggedForMeal.length ? taggedForMeal : recipes;
    return mealPool.filter((recipe) => {
      const recipeCollections = collectionNamesByRecipe.get(recipe.id) ?? [];
      const haystack = [
        recipe.title,
        recipe.summary,
        recipe.category,
        ...recipe.tags,
        ...recipeCollections,
      ]
        .join(' ')
        .toLocaleLowerCase();
      if (deferredSearch && !haystack.includes(deferredSearch)) return false;
      if (activeCollection !== 'all') {
        const belongs = collectionMemberships.some(
          (membership) =>
            membership.collectionId === activeCollection && membership.recipeId === recipe.id,
        );
        if (!belongs) return false;
      }
      if (category !== 'all' && recipe.category !== category) return false;
      if (maxMinutes !== 'any' && recipeMinutes(recipe) > Number(maxMinutes)) return false;
      return true;
    });
  }, [
    activeCollection,
    activeMeal,
    category,
    collectionMemberships,
    collectionNamesByRecipe,
    deferredSearch,
    maxMinutes,
    showAll,
    recipes,
  ]);

  const activeMealSlots = dates.map((date) => slotKey(date, activeMeal));
  const filledCount = Object.keys(assignments).filter((key) => assignments[key]).length;
  const activeMealFilledCount = activeMealSlots.filter((key) => assignments[key]).length;

  function chooseMeal(meal: MealType) {
    setActiveMeal(meal);
    const firstEmpty = dates.map((date) => slotKey(date, meal)).find((key) => !assignments[key]);
    setActiveSlot(firstEmpty ?? slotKey(dates[0]!, meal));
  }

  function chooseRecipe(recipeId: string) {
    const targetSlot = activeSlot || activeMealSlots[0];
    if (!targetSlot) return;
    const nextAssignments = { ...assignments, [targetSlot]: recipeId };
    setAssignments(nextAssignments);
    const targetIndex = activeMealSlots.indexOf(targetSlot);
    const nextSlot = activeMealSlots.slice(targetIndex + 1).find((key) => !nextAssignments[key]);
    if (nextSlot) setActiveSlot(nextSlot);
  }

  async function addRecipesToPlan() {
    const entries = Object.entries(assignments).flatMap(([key, recipeId]) => {
      if (!recipeId) return [];
      const [plannedFor, meal] = key.split(':') as [string, MealType];
      return [
        {
          plannedFor,
          profileIds,
          meal,
          recipeId,
          title: '',
          servings,
          note: profileNames.length ? `For ${profileNames.join(', ')}` : '',
        },
      ];
    });
    if (!entries.length || busy || uncertain) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/meal-plan/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const body = (await response.json().catch(() => null)) as {
        meals?: PlannedMeal[];
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        if (response.status >= 500) {
          setUncertain(true);
          onUncertain?.();
          setError(
            'We could not confirm whether these meals were added. Check the calendar before submitting again. Your selections are retained.',
          );
          return;
        }
        setError(
          body?.error?.message ?? 'We could not add those meals. Your selections are retained.',
        );
        return;
      }
      if (!Array.isArray(body?.meals) || body.meals.length !== entries.length)
        throw new Error('Unconfirmed response');
      setAssignments({});
      setUncertain(false);
      onSaved(entries.length, body.meals);
    } catch {
      setUncertain(true);
      onUncertain?.();
      setError(
        'We could not confirm whether these meals were added. Check the calendar before submitting again. Your selections are retained.',
      );
    } finally {
      setBusy(false);
    }
  }
  function dismiss() {
    if (!busy) onClose();
  }
  const [targetDate] = activeSlot.split(':');
  if (!open) return null;
  return (
    <AppDialog
      className={styles.selectorDialog}
      aria-labelledby="recipe-selector-title"
      onClose={dismiss}
    >
      <div className={styles.dialogShell}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="recipe-selector-title">Add meals</h2>
            <p>Selections are temporary until added.</p>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close recipe selector"
            disabled={busy}
            onClick={dismiss}
          >
            <X size={22} />
          </button>
        </header>

        <div className={styles.selectorBody}>
          <fieldset disabled={busy} className={styles.selectorFields}>
            <div className={styles.assignmentTarget} role="status" aria-live="polite">
              <strong>
                {formatPlannerDate(targetDate || startDate, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}{' '}
                · {labelForMeal(activeMeal)}
              </strong>
              <span>
                Select assigns to this meal. {servings} {servings === 1 ? 'serving' : 'servings'}.
              </span>
            </div>
            <div className={styles.dialogTools}>
              <label className={styles.searchField}>
                <Search size={19} aria-hidden="true" />
                <span className="sr-only">Search recipes</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search recipes"
                />
              </label>
              {onOtherKind ? (
                <details className={styles.alternativeKinds}>
                  <summary className="recipe-disclosure-summary">
                    <span>Meal alternatives</span>
                    <ChevronDown size={18} />
                  </summary>
                  <div className={styles.collectionRow}>
                    {(['item', 'options', 'fast', 'leftover', 'takeout', 'custom'] as const).map(
                      (kind) => (
                        <button
                          type="button"
                          key={kind}
                          onClick={() =>
                            onOtherKind(kind, { date: targetDate || startDate, meal: activeMeal })
                          }
                        >
                          {
                            {
                              item: 'Single food or drink',
                              options: 'Choose-one options',
                              fast: 'Fasting / no meal',
                              leftover: 'Leftovers',
                              takeout: 'Eating out',
                              custom: 'Other meal',
                            }[kind]
                          }
                        </button>
                      ),
                    )}
                  </div>
                </details>
              ) : null}
              <details className={styles.filterDisclosure}>
                <summary className="recipe-disclosure-summary">
                  <span>
                    Filters and collections
                    {category !== 'all' || maxMinutes !== 'any' || activeCollection !== 'all'
                      ? ' · active'
                      : ''}
                  </span>
                  <ChevronDown size={18} />
                </summary>{' '}
                <div className={styles.filterRow} aria-label="Recipe filters">
                  <label>
                    <span className="sr-only">Category</span>
                    <select value={category} onChange={(event) => setCategory(event.target.value)}>
                      <option value="all">All categories</option>
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Maximum total time</span>
                    <select
                      value={maxMinutes}
                      onChange={(event) => setMaxMinutes(event.target.value)}
                    >
                      <option value="any">Any time</option>
                      <option value="30">30 minutes or less</option>
                      <option value="60">60 minutes or less</option>
                    </select>
                  </label>
                </div>
                <div className={styles.collectionRow} aria-label="Collections">
                  <span>Collections</span>
                  <button
                    type="button"
                    aria-pressed={activeCollection === 'all'}
                    onClick={() => setActiveCollection('all')}
                  >
                    All collections
                  </button>
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      aria-pressed={activeCollection === collection.id}
                      onClick={() => setActiveCollection(collection.id)}
                    >
                      {collection.name}
                    </button>
                  ))}
                </div>
              </details>
            </div>

            <div className={styles.mealTabs} role="group" aria-label="Meals to fill">
              {mealTypes.map((meal) => {
                const mealFilled = dates.filter((date) => assignments[slotKey(date, meal)]).length;
                return (
                  <button
                    key={meal}
                    type="button"
                    aria-pressed={activeMeal === meal}
                    onClick={() => chooseMeal(meal)}
                  >
                    {labelForMeal(meal)}{' '}
                    <span>
                      {mealFilled} of {duration}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.suggestionScope}>
              <span>
                {showAll || deferredSearch
                  ? 'All saved recipes'
                  : `Suggestions for ${labelForMeal(activeMeal)}`}{' '}
                · {filteredRecipes.length} matches
              </span>
              <button
                type="button"
                aria-pressed={showAll}
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? 'Show suggestions' : 'All saved recipes'}
              </button>
              {search ||
              category !== 'all' ||
              maxMinutes !== 'any' ||
              activeCollection !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCategory('all');
                    setMaxMinutes('any');
                    setActiveCollection('all');
                  }}
                >
                  Reset filters
                </button>
              ) : null}
            </div>
            <details className={styles.assignmentDisclosure}>
              <summary className="recipe-disclosure-summary">
                <span>
                  Review {labelForMeal(activeMeal)} assignments · {activeMealFilledCount} selected
                </span>
                <ChevronDown size={18} />
              </summary>{' '}
              <section className={styles.assignmentRail} aria-label={`${activeMeal} plan`}>
                <div>
                  <h3>{labelForMeal(activeMeal)} plan</h3>
                  <span>
                    {activeMealFilledCount} of {duration} selected
                  </span>
                </div>
                <div className={styles.assignmentSlots}>
                  {dates.map((date) => {
                    const key = slotKey(date, activeMeal);
                    const recipe = recipes.find((item) => item.id === assignments[key]);
                    return (
                      <button
                        key={key}
                        className={activeSlot === key ? styles.activeSlot : undefined}
                        type="button"
                        onClick={() => setActiveSlot(key)}
                      >
                        <span>
                          {formatPlannerDate(date, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <strong>{recipe?.title ?? 'Choose recipe'}</strong>
                      </button>
                    );
                  })}
                </div>
              </section>
            </details>
            <div className={styles.dialogContent}>
              <section
                className={styles.recipeResults}
                aria-label={`${activeMeal} recipes`}
                aria-busy={busy}
              >
                {filteredRecipes.length ? (
                  filteredRecipes.map((recipe) => (
                    <RecipeChoiceCard
                      key={recipe.id}
                      recipe={recipe}
                      selected={assignments[activeSlot] === recipe.id}
                      disabled={busy}
                      onSelect={() => chooseRecipe(recipe.id)}
                    />
                  ))
                ) : (
                  <div className={styles.noResults}>
                    <ChefHat size={30} aria-hidden="true" />
                    <h3>No matching recipes</h3>
                    <p>
                      Try a different query or reset filters. Use Meal alternatives to plan without
                      a saved recipe.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAll(true);
                        setSearch('');
                        setCategory('all');
                        setMaxMinutes('any');
                        setActiveCollection('all');
                      }}
                    >
                      Show all saved recipes
                    </button>
                  </div>
                )}
              </section>
            </div>
          </fieldset>
        </div>
        <footer className={styles.dialogFooter}>
          <p>
            {filledCount} unsubmitted {filledCount === 1 ? 'meal' : 'meals'} selected
          </p>
          {filledCount > 0 ? (
            <small>
              Closing keeps these selections for this context. Changing date, range or meal types,
              navigating away or reloading discards them.
            </small>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div>
            {filledCount ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAssignments({});
                  setUncertain(false);
                  setError(null);
                }}
              >
                Clear selections
              </button>
            ) : null}
            {uncertain ? (
              <button type="button" disabled={busy} onClick={dismiss}>
                Check calendar
              </button>
            ) : null}
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={busy}
              onClick={dismiss}
            >
              Close picker
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || uncertain || !filledCount}
              onClick={addRecipesToPlan}
            >
              {busy ? <LoadingIndicator label="Adding recipes to plan" /> : null}
              {busy
                ? 'Adding recipes…'
                : filledCount
                  ? `Add ${filledCount} ${filledCount === 1 ? 'meal' : 'meals'}`
                  : 'Select a meal to continue'}
            </button>
          </div>
        </footer>
      </div>
    </AppDialog>
  );
}
