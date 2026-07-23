'use client';

import { Check, ChefHat, Clock3, Search, X } from 'lucide-react';
import Image from 'next/image';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  formatPlannerDate,
  mealTypeLabel,
  plannerDates,
  type MealType,
} from '@/components/meal-planner-types';
import styles from '@/components/meal-planner.module.css';
import { InlineSkeleton } from '@/components/skeleton';
import type { PlannedMeal } from '@/lib/services/planning-service';
import type { RecipeListItem } from '@/lib/services/recipe-service';

type CollectionOption = { id: string; name: string };
type CollectionMembership = { collectionId: string; recipeId: string };

type RecipeSelectorProps = {
  open: boolean;
  startDate: string;
  duration: number;
  mealTypes: MealType[];
  recipes: RecipeListItem[];
  collections: CollectionOption[];
  collectionMemberships: CollectionMembership[];
  servings: number;
  profileNames: string[];
  initialDate?: string;
  initialMealType?: MealType;
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
}: {
  recipe: RecipeListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`${styles.recipeChoice}${selected ? ` ${styles.selectedRecipe}` : ''}`}>
      <div className={styles.recipeChoiceMedia}>
        {recipe.image ? (
          <Image
            src={`/api/v1/recipes/${recipe.id}/images/${recipe.image.id}`}
            alt={recipe.image.altText || recipe.title}
            width={recipe.image.width}
            height={recipe.image.height}
            sizes="(max-width: 620px) 42vw, 240px"
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
          {[recipe.category, ...recipe.tags]
            .filter(Boolean)
            .slice(0, 3)
            .map((label) => (
              <span key={label}>{label}</span>
            ))}
        </div>
        <p>
          <Clock3 size={14} aria-hidden="true" /> {recipeMinutes(recipe)} min
        </p>
        <button
          className={selected ? styles.selectedButton : styles.secondaryButton}
          type="button"
          onClick={onSelect}
        >
          {selected ? <Check size={16} aria-hidden="true" /> : null}
          {selected ? 'Selected' : 'Select'}
        </button>
      </div>
    </article>
  );
}

export function MealPlanRecipeSelector({
  open,
  startDate,
  duration,
  mealTypes,
  recipes,
  collections,
  collectionMemberships,
  servings,
  profileNames,
  initialDate,
  initialMealType,
  onClose,
  onSaved,
}: RecipeSelectorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
    const mealPool = taggedForMeal.length ? taggedForMeal : recipes;
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
          meal,
          recipeId,
          title: '',
          servings,
          note: profileNames.length ? `For ${profileNames.join(', ')}` : '',
        },
      ];
    });
    if (!entries.length) return;
    setBusy(true);
    setError(null);
    const response = await fetch('/api/v1/meal-plan/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    const body = (await response.json().catch(() => null)) as {
      meals?: PlannedMeal[];
      error?: { message?: string };
    } | null;
    setBusy(false);
    if (!response.ok) {
      setError(body?.error?.message ?? 'We could not add those recipes to the plan.');
      return;
    }
    onSaved(entries.length, body?.meals ?? []);
  }

  return (
    <dialog
      className={styles.selectorDialog}
      ref={dialogRef}
      aria-labelledby="recipe-selector-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className={styles.dialogShell}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="recipe-selector-title">Select recipes</h2>
            <p>Choose a recipe for each meal in your plan.</p>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close recipe selector"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>

        <div className={styles.dialogTools}>
          <label className={styles.searchField}>
            <Search size={19} aria-hidden="true" />
            <span className={styles.srOnly}>Search recipes</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipes, tags, categories, or collections"
            />
          </label>
          <div className={styles.filterRow} aria-label="Recipe filters">
            <label>
              <span className={styles.srOnly}>Category</span>
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
              <span className={styles.srOnly}>Maximum total time</span>
              <select value={maxMinutes} onChange={(event) => setMaxMinutes(event.target.value)}>
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
              All recipes
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
        </div>

        <div className={styles.mealTabs} role="tablist" aria-label="Meals to fill">
          {mealTypes.map((meal) => {
            const mealFilled = dates.filter((date) => assignments[slotKey(date, meal)]).length;
            return (
              <button
                key={meal}
                type="button"
                role="tab"
                aria-selected={activeMeal === meal}
                onClick={() => chooseMeal(meal)}
              >
                {mealTypeLabel(meal)}{' '}
                <span>
                  {mealFilled} of {duration}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.dialogContent}>
          <section
            className={styles.recipeResults}
            aria-label={`${activeMeal} recipes`}
            aria-busy={busy}
          >
            {busy ? (
              <div className={styles.recipeLoading}>
                <InlineSkeleton label="Updating recipe plan" width="100%" />
                <InlineSkeleton label="Updating recipe plan" width="88%" />
                <InlineSkeleton label="Updating recipe plan" width="94%" />
              </div>
            ) : filteredRecipes.length ? (
              filteredRecipes.map((recipe) => (
                <RecipeChoiceCard
                  key={recipe.id}
                  recipe={recipe}
                  selected={assignments[activeSlot] === recipe.id}
                  onSelect={() => chooseRecipe(recipe.id)}
                />
              ))
            ) : (
              <div className={styles.noResults}>
                <ChefHat size={30} aria-hidden="true" />
                <h3>No matching recipes</h3>
                <p>Try a different search, collection, category, or time filter.</p>
              </div>
            )}
          </section>

          <section className={styles.assignmentRail} aria-label={`${activeMeal} plan`}>
            <div>
              <h3>{mealTypeLabel(activeMeal)} plan</h3>
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
        </div>

        <footer className={styles.dialogFooter}>
          <p>
            {filledCount} of {duration * mealTypes.length} meal slots filled
          </p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <button className={styles.secondaryButton} type="button" onClick={onClose}>
              Save and finish later
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || !filledCount}
              onClick={addRecipesToPlan}
            >
              {busy
                ? 'Adding recipes…'
                : `Add ${filledCount} ${filledCount === 1 ? 'recipe' : 'recipes'} to plan`}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
