'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';
import type {
  MealPlanPreferences,
  PantryPreferences,
  RecipePreferences,
} from '@/lib/domain/app-preferences';
import { MEAL_OPTIONS } from '@/lib/domain/meal-types';

async function savePreferences(category: 'recipes' | 'mealPlan' | 'pantry', values: unknown) {
  const response = await fetch('/api/v1/settings/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, values }),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? 'These settings could not be saved.');
}

function SaveButton({
  pending,
  disabled = false,
  label,
}: {
  pending: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button className="primary-button compact" type="submit" disabled={pending || disabled}>
      {pending ? <InlineSkeleton label={label} width="1rem" /> : <Save size={16} />}
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function RecipePreferencesForm({ initial }: { initial: RecipePreferences }) {
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="settings-card preference-settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await savePreferences('recipes', values);
          showToast('Recipe defaults saved.', 'success');
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : 'Recipe settings could not be saved.',
            'error',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <p className="eyebrow">LIBRARY DEFAULTS</p>
        <h2>Start with the view you use most.</h2>
        <p>These shared defaults apply when a page URL does not already specify another choice.</p>
      </div>
      <div className="field-grid two-columns">
        <label>
          <span>Default library order</span>
          <select
            value={values.defaultSort}
            onChange={(event) =>
              setValues({
                ...values,
                defaultSort: event.target.value as RecipePreferences['defaultSort'],
              })
            }
          >
            <option value="recently-updated">Recently updated</option>
            <option value="recently-added">Recently added</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="most-recently-cooked">Recently cooked</option>
            <option value="shortest-time">Shortest time</option>
            <option value="highest-rated">Highest rated</option>
          </select>
        </label>
        <label>
          <span>Default servings for new recipes</span>
          <input
            type="number"
            min={1}
            max={100}
            value={values.defaultServings}
            onChange={(event) =>
              setValues({ ...values, defaultServings: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <SaveButton pending={pending} label="Save recipe settings" />
    </form>
  );
}

export function MealPlanPreferencesForm({ initial }: { initial: MealPlanPreferences }) {
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="settings-card preference-settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await savePreferences('mealPlan', values);
          showToast('Meal plan defaults saved.', 'success');
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : 'Meal plan settings could not be saved.',
            'error',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <p className="eyebrow">PLANNER DEFAULTS</p>
        <h2>Shape the planner around your household.</h2>
        <p>The planner still lets you change these choices for an individual week.</p>
      </div>
      <div className="field-grid two-columns">
        <label>
          <span>Week starts on</span>
          <select
            value={values.weekStartsOn}
            onChange={(event) =>
              setValues({ ...values, weekStartsOn: Number(event.target.value) as 0 | 1 })
            }
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>
        <label>
          <span>Default planning window</span>
          <select
            value={values.defaultDuration}
            onChange={(event) =>
              setValues({
                ...values,
                defaultDuration: Number(event.target.value) as 3 | 5 | 7 | 14,
              })
            }
          >
            <option value={3}>3 days</option>
            <option value={5}>5 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </select>
        </label>
      </div>
      <fieldset className="settings-choice-group">
        <legend>Meals shown when planning</legend>
        <div className="settings-toggle-grid">
          {MEAL_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={values.visibleMealTypes.includes(option.value)}
                onChange={(event) =>
                  setValues({
                    ...values,
                    visibleMealTypes: event.target.checked
                      ? [...values.visibleMealTypes, option.value]
                      : values.visibleMealTypes.filter((meal) => meal !== option.value),
                  })
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <SaveButton
        pending={pending}
        disabled={values.visibleMealTypes.length === 0}
        label="Save meal plan settings"
      />
    </form>
  );
}

export function PantryPreferencesForm({ initial }: { initial: PantryPreferences }) {
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="settings-card preference-settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await savePreferences('pantry', values);
          showToast('Pantry defaults saved.', 'success');
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : 'Pantry settings could not be saved.',
            'error',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <p className="eyebrow">PANTRY DEFAULTS</p>
        <h2>Open Pantry where the work is.</h2>
        <p>Choose the initial filter, order, and grouping used on each new Pantry visit.</p>
      </div>
      <div className="field-grid three-columns">
        <label>
          <span>Default view</span>
          <select
            value={values.defaultView}
            onChange={(event) =>
              setValues({
                ...values,
                defaultView: event.target.value as PantryPreferences['defaultView'],
              })
            }
          >
            <option value="all">All stock</option>
            <option value="pantry">Pantry</option>
            <option value="refrigerator">Refrigerator</option>
            <option value="freezer">Freezer</option>
            <option value="low_stock">Low stock</option>
            <option value="opened">Opened</option>
            <option value="unopened">Unopened</option>
            <option value="frozen">Frozen</option>
            <option value="recent">Recent</option>
          </select>
        </label>
        <label>
          <span>Default order</span>
          <select
            value={values.defaultSort}
            onChange={(event) =>
              setValues({
                ...values,
                defaultSort: event.target.value as PantryPreferences['defaultSort'],
              })
            }
          >
            <option value="expiry">Expiry first</option>
            <option value="name">Product name</option>
            <option value="quantity">Quantity</option>
            <option value="location">Location</option>
            <option value="updated">Recently updated</option>
            <option value="added">Recently added</option>
          </select>
        </label>
        <label>
          <span>Default grouping</span>
          <select
            value={values.defaultGroup}
            onChange={(event) =>
              setValues({
                ...values,
                defaultGroup: event.target.value as PantryPreferences['defaultGroup'],
              })
            }
          >
            <option value="location">Location</option>
            <option value="category">Category</option>
            <option value="expiry">Expiry</option>
            <option value="none">No grouping</option>
          </select>
        </label>
      </div>
      <SaveButton pending={pending} label="Save pantry settings" />
    </form>
  );
}
