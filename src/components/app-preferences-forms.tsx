'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';
import { useSettingsSave } from './use-settings-save';

import { LoadingIndicator } from '@/components/skeleton';
import {
  SettingsActionBar,
  SettingsPane,
  SettingsRow,
  SettingsField,
} from '@/components/settings-primitives';
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
    preferences?: {
      recipes: RecipePreferences;
      mealPlan: MealPlanPreferences;
      pantry: PantryPreferences;
    };
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.preferences)
    throw new Error(body?.error?.message ?? 'These settings could not be saved.');
  return body.preferences;
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
      {pending ? <LoadingIndicator label={label} /> : <Save size={16} />}
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function RecipePreferencesForm({ initial }: { initial: RecipePreferences }) {
  const { values, setValues, pending, dirty, status, save } = useSettingsSave(initial);
  const [servings, setServings] = useState(String(initial.defaultServings));
  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          async (snapshot) =>
            (await savePreferences('recipes', { ...snapshot, defaultServings: Number(servings) }))
              .recipes,
          'Recipe settings saved.',
        );
      }}
    >
      <fieldset disabled={pending} className="settings-form-fields">
        <SettingsPane
          title="Recipe defaults"
          description="Starting choices for the library and newly created recipes."
        >
          <SettingsField
            title="Default recipe order"
            description="Choose how the shared library is ordered when someone first opens it."
          >
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
          </SettingsField>
          <SettingsField
            title="New recipe servings"
            description="Pre-fill this serving count when a household member creates a recipe."
          >
            <input
              type="number"
              min={1}
              max={100}
              required
              step={1}
              value={servings}
              onChange={(event) => {
                setServings(event.target.value);
                setValues({ ...values, defaultServings: Number(event.target.value) });
              }}
            />
          </SettingsField>
          <SettingsActionBar status={status}>
            <SaveButton pending={pending} disabled={!dirty} label="Save recipe settings" />
          </SettingsActionBar>
        </SettingsPane>
      </fieldset>
    </form>
  );
}

export function MealPlanPreferencesForm({ initial }: { initial: MealPlanPreferences }) {
  const { values, setValues, pending, dirty, status, save } = useSettingsSave(initial);
  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          async (snapshot) => (await savePreferences('mealPlan', snapshot)).mealPlan,
          'Meal plan settings saved.',
        );
      }}
    >
      <fieldset disabled={pending} className="settings-form-fields">
        <SettingsPane
          title="Meal-plan defaults"
          description="Initial setup choices. Existing meals, generation selections and calendar view stay independent."
        >
          <SettingsField
            description="The first day shown in each planner week."
            title="Week starts on"
          >
            <select
              value={values.weekStartsOn}
              onChange={(event) =>
                setValues({ ...values, weekStartsOn: Number(event.target.value) as 0 | 1 })
              }
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </SettingsField>
          <SettingsField
            description="The initial range for new planning; this does not choose a calendar zoom."
            title="Default planning range"
          >
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
          </SettingsField>
          <SettingsRow
            title="Meals shown in the planner"
            description="Choose at least one row. In-use meal types remain accessible; generation choices are separate."
            align="start"
          >
            <fieldset className="settings-choice-group">
              <legend className="sr-only">Meals shown when planning</legend>
              <div className="settings-toggle-grid">
                {[
                  ...MEAL_OPTIONS,
                  ...values.customMealTypes.map((item) => ({
                    value: item.value,
                    label: item.label,
                  })),
                ].map((option) => (
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
          </SettingsRow>
          <SettingsActionBar status={status}>
            <SaveButton
              pending={pending}
              disabled={!dirty || values.visibleMealTypes.length === 0}
              label="Save meal plan settings"
            />
          </SettingsActionBar>
        </SettingsPane>
      </fieldset>
    </form>
  );
}

export function PantryPreferencesForm({ initial }: { initial: PantryPreferences }) {
  const { values, setValues, pending, dirty, status, save } = useSettingsSave(initial);
  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          async (snapshot) => (await savePreferences('pantry', snapshot)).pantry,
          'Pantry settings saved.',
        );
      }}
    >
      <fieldset disabled={pending} className="settings-form-fields">
        <SettingsPane
          title="Pantry display"
          description="Choose the initial filter, order, and grouping used on each new Pantry visit."
        >
          <SettingsField
            description="The stock filter used when first opening Pantry."
            title="Filter"
          >
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
          </SettingsField>
          <SettingsField description="How pantry stock is sorted initially." title="Sort order">
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
          </SettingsField>
          <SettingsField
            description="Organise by location, category, expiry, or leave stock ungrouped."
            title="Group by"
          >
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
          </SettingsField>
          <SettingsActionBar status={status}>
            <SaveButton pending={pending} disabled={!dirty} label="Save pantry settings" />
          </SettingsActionBar>
        </SettingsPane>
      </fieldset>
    </form>
  );
}
