'use client';

import {
  CalendarDays,
  CalendarPlus,
  Copy,
  LoaderCircle,
  Printer,
  ShoppingBasket,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { PlannedMeal } from '@/lib/services/planning-service';
import type { RecipeListItem } from '@/lib/services/recipe-service';

type MealPlannerProps = {
  weekStart: string;
  weekEnd: string;
  meals: PlannedMeal[];
  recipes: RecipeListItem[];
  previousWeekStart: string;
  nextWeekStart: string;
};

export function MealPlanner({
  weekStart,
  weekEnd,
  meals,
  recipes,
  previousWeekStart,
  nextWeekStart,
}: MealPlannerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<'recipe' | 'freeform'>('recipe');
  async function addMeal(formData: FormData) {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/v1/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plannedFor: formData.get('plannedFor'),
        meal: formData.get('meal'),
        recipeId: String(formData.get('recipeId') ?? ''),
        title: String(formData.get('title') ?? ''),
        servings: formData.get('servings'),
        note: formData.get('note'),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setError('We could not add that meal. Check the plan details and try again.');
      return;
    }
    router.refresh();
  }
  async function copyWeek() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/v1/meal-plan/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart, destinationWeekStart: nextWeekStart }),
    });
    setBusy(false);
    if (!response.ok) {
      setError('We could not copy this week yet.');
      return;
    }
    router.push(`/planner?week=${nextWeekStart}`);
  }
  async function removeMeal(id: string) {
    setBusy(true);
    await fetch(`/api/v1/meal-plan/${id}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }
  async function generateList() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/v1/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart, weekEnd }),
    });
    const body = (await response.json().catch(() => null)) as {
      list?: { id: string };
      error?: { message?: string };
    } | null;
    setBusy(false);
    if (!response.ok || !body?.list) {
      setError(body?.error?.message ?? 'Plan at least one meal before generating a list.');
      return;
    }
    router.push(`/lists/${body.list.id}`);
  }
  return (
    <div className="planner-layout">
      <form className="plan-form" action={addMeal}>
        <h2>Plan a meal</h2>
        <label>
          <span>Date</span>
          <input name="plannedFor" type="date" defaultValue={weekStart} required />
        </label>
        <label>
          <span>Meal</span>
          <select name="meal" defaultValue="dinner">
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </label>
        <fieldset className="plan-entry-kind">
          <legend>Plan from</legend>
          <label>
            <input
              type="radio"
              name="entryKind"
              checked={entryKind === 'recipe'}
              onChange={() => setEntryKind('recipe')}
            />{' '}
            A saved recipe
          </label>
          <label>
            <input
              type="radio"
              name="entryKind"
              checked={entryKind === 'freeform'}
              onChange={() => setEntryKind('freeform')}
            />{' '}
            A free-form meal
          </label>
        </fieldset>
        <label>
          <span>Recipe</span>
          <select
            name="recipeId"
            required={entryKind === 'recipe'}
            disabled={entryKind !== 'recipe'}
            defaultValue=""
          >
            <option value="" disabled>
              Choose a recipe
            </option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Free-form meal</span>
          <input
            name="title"
            disabled={entryKind !== 'freeform'}
            required={entryKind === 'freeform'}
            placeholder="e.g. Leftovers night"
          />
        </label>
        <label>
          <span>Servings</span>
          <input name="servings" type="number" min="1" defaultValue="4" required />
        </label>
        <label>
          <span>
            Note <em>(optional)</em>
          </span>
          <input name="note" placeholder="e.g. double for leftovers" />
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={busy || (entryKind === 'recipe' && !recipes.length)}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <CalendarPlus size={17} />} Add to
          plan
        </button>
        {!recipes.length && entryKind === 'recipe' && (
          <p className="muted">Add a recipe to the cookbook before planning meals.</p>
        )}
      </form>
      <section className="week-plan">
        <div className="section-heading">
          <p className="eyebrow">
            {weekStart} TO {weekEnd}
          </p>
          <h2>This week at the table</h2>
        </div>
        <div className="plan-navigation" aria-label="Week actions">
          <button
            className="text-button"
            type="button"
            onClick={() => router.push(`/planner?week=${previousWeekStart}`)}
          >
            Previous week
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy || !meals.length}
            onClick={copyWeek}
          >
            <Copy size={15} /> Copy to next week
          </button>
          <a
            className="text-button"
            href={`/api/v1/meal-plan/export?start=${weekStart}&end=${weekEnd}`}
          >
            <CalendarDays size={15} /> Calendar file
          </a>
          <button className="text-button" type="button" onClick={() => window.print()}>
            <Printer size={15} /> Print plan
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => router.push(`/planner?week=${nextWeekStart}`)}
          >
            Next week
          </button>
        </div>
        {meals.length ? (
          <div className="meal-list">
            {meals.map((meal) => (
              <article key={meal.id}>
                <div>
                  <p>
                    {meal.plannedFor} · {meal.meal}
                  </p>
                  <h3>{meal.recipeTitle}</h3>
                  <span>
                    {meal.servings} servings{meal.note ? ` · ${meal.note}` : ''}
                  </span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove ${meal.recipeTitle} from the plan`}
                  onClick={() => removeMeal(meal.id)}
                  disabled={busy}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-note">Pick a recipe and a date to start this week’s plan.</p>
        )}
        <button
          className="primary-button"
          type="button"
          disabled={busy || !meals.length}
          onClick={generateList}
        >
          <ShoppingBasket size={17} /> Generate an editable shopping list
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
