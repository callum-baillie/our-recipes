import 'server-only';

import { asc, eq } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { householdExperienceSettings, households, profiles } from '@/lib/db/schema';
import {
  DEFAULT_MEAL_PLAN_PREFERENCES,
  DEFAULT_PANTRY_PREFERENCES,
  DEFAULT_RECIPE_PREFERENCES,
  appPreferencesUpdateSchema,
  mealPlanPreferencesSchema,
  pantryPreferencesSchema,
  recipePreferencesSchema,
  type AppPreferencesUpdate,
} from '@/lib/domain/app-preferences';

export class AppPreferencesConflictError extends Error {}

export type AppPreferences = {
  recipes: typeof DEFAULT_RECIPE_PREFERENCES;
  mealPlan: typeof DEFAULT_MEAL_PLAN_PREFERENCES;
  pantry: typeof DEFAULT_PANTRY_PREFERENCES;
};

function parseMealTypeSettings(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return {
        defaultMealTypes: mealPlanPreferencesSchema.shape.defaultMealTypes.parse(parsed),
        visibleMealTypes: DEFAULT_MEAL_PLAN_PREFERENCES.visibleMealTypes,
        customMealTypes: DEFAULT_MEAL_PLAN_PREFERENCES.customMealTypes,
      };
    }
    const value = parsed as {
      defaultMealTypes?: unknown;
      visibleMealTypes?: unknown;
      customMealTypes?: unknown;
    };
    return {
      defaultMealTypes: mealPlanPreferencesSchema.shape.defaultMealTypes.parse(
        value.defaultMealTypes,
      ),
      visibleMealTypes: mealPlanPreferencesSchema.shape.visibleMealTypes.parse(
        value.visibleMealTypes,
      ),
      customMealTypes: mealPlanPreferencesSchema.shape.customMealTypes.parse(value.customMealTypes),
    };
  } catch {
    return {
      defaultMealTypes: DEFAULT_MEAL_PLAN_PREFERENCES.defaultMealTypes,
      visibleMealTypes: DEFAULT_MEAL_PLAN_PREFERENCES.visibleMealTypes,
      customMealTypes: DEFAULT_MEAL_PLAN_PREFERENCES.customMealTypes,
    };
  }
}

function rowToPreferences(
  row: typeof householdExperienceSettings.$inferSelect | undefined,
): AppPreferences {
  if (!row) {
    return {
      recipes: DEFAULT_RECIPE_PREFERENCES,
      mealPlan: DEFAULT_MEAL_PLAN_PREFERENCES,
      pantry: DEFAULT_PANTRY_PREFERENCES,
    };
  }
  return {
    recipes: recipePreferencesSchema.parse({
      defaultSort: row.recipeDefaultSort,
      defaultServings: row.recipeDefaultServings,
    }),
    mealPlan: mealPlanPreferencesSchema.parse({
      weekStartsOn: row.mealPlanWeekStartsOn,
      defaultDuration: row.mealPlanDefaultDuration,
      ...parseMealTypeSettings(row.mealPlanDefaultMealTypes),
    }),
    pantry: pantryPreferencesSchema.parse({
      defaultView: row.pantryDefaultView,
      defaultSort: row.pantryDefaultSort,
      defaultGroup: row.pantryDefaultGroup,
    }),
  };
}

export function getAppPreferences(): AppPreferences {
  ensureDatabase();
  const household = getDatabase()
    .select()
    .from(households)
    .orderBy(asc(households.createdAt))
    .get();
  if (!household) return rowToPreferences(undefined);
  const row = getDatabase()
    .select()
    .from(householdExperienceSettings)
    .where(eq(householdExperienceSettings.householdId, household.id))
    .get();
  return rowToPreferences(row);
}

export function updateAppPreferences(raw: AppPreferencesUpdate, actorProfileId: string) {
  ensureDatabase();
  const input = appPreferencesUpdateSchema.parse(raw);
  const database = getDatabase();
  database.transaction((transaction) => {
    const household = transaction
      .select()
      .from(households)
      .orderBy(asc(households.createdAt))
      .get();
    if (!household) throw new AppPreferencesConflictError('Set up the household first.');
    const actor = transaction
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, actorProfileId))
      .get();
    if (!actor) throw new AppPreferencesConflictError('Choose a household profile first.');

    const now = new Date();
    transaction
      .insert(householdExperienceSettings)
      .values({
        householdId: household.id,
        updatedByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();

    const values =
      input.category === 'recipes'
        ? {
            recipeDefaultSort: input.values.defaultSort,
            recipeDefaultServings: input.values.defaultServings,
          }
        : input.category === 'mealPlan'
          ? {
              mealPlanWeekStartsOn: input.values.weekStartsOn,
              mealPlanDefaultDuration: input.values.defaultDuration,
              mealPlanDefaultMealTypes: JSON.stringify({
                defaultMealTypes: input.values.defaultMealTypes,
                visibleMealTypes: input.values.visibleMealTypes,
                customMealTypes: input.values.customMealTypes,
              }),
            }
          : {
              pantryDefaultView: input.values.defaultView,
              pantryDefaultSort: input.values.defaultSort,
              pantryDefaultGroup: input.values.defaultGroup,
            };
    transaction
      .update(householdExperienceSettings)
      .set({
        ...values,
        version:
          transaction
            .select({ version: householdExperienceSettings.version })
            .from(householdExperienceSettings)
            .where(eq(householdExperienceSettings.householdId, household.id))
            .get()!.version + 1,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(householdExperienceSettings.householdId, household.id))
      .run();
  });
  return getAppPreferences();
}
