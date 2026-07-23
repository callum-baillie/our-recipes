import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { eq } from 'drizzle-orm';

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { mealPlanEntries, nutritionMealAllocationVersions, recipes } from '@/lib/db/schema';
import { addProfile, completeSetup } from '@/lib/services/household-service';
import {
  addMealPlanEntriesWithNutrition,
  addMealPlanEntryWithNutrition,
  duplicateWeekWithNutrition,
  removeMealPlanEntryWithNutrition,
  updateMealPlanEntryStatusWithNutrition,
  updateMealPlanEntryWithNutrition,
} from '@/lib/services/nutrition-planning-orchestration-service';
import { listPlannedMeals, refreshMealPlanRecipeSnapshot } from '@/lib/services/planning-service';

function setupOneProfile() {
  return completeSetup({
    householdName: 'Planner household',
    appName: 'Our Recipes',
    profile: {
      displayName: 'Avery',
      color: '#536938',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-US',
      timezone: 'UTC',
    },
  }).profiles[0]!;
}

describe('meal plan Nutrition allocation orchestration', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('automatically assigns the full serving count in a one-profile household', () => {
    const actor = setupOneProfile();
    const entry = addMealPlanEntryWithNutrition(
      {
        plannedFor: '2026-07-21',
        meal: 'dinner',
        recipeId: '',
        title: 'Garden bowls',
        servings: 2.5,
        note: '',
      },
      actor.id,
    );
    const allocations = getDatabase()
      .select()
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entry.id))
      .all();
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({
      state: 'planned',
      servings: 2.5,
      actorHouseholdProfileId: actor.id,
    });
  });

  it('leaves new meals unassigned when more than one profile is active', () => {
    const actor = setupOneProfile();
    addProfile({
      displayName: 'Riley',
      color: '#75538f',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-US',
      timezone: 'UTC',
    });
    const entry = addMealPlanEntryWithNutrition(
      {
        plannedFor: '2026-07-21',
        meal: 'dinner',
        recipeId: '',
        title: 'Shared supper',
        servings: 4,
        note: '',
      },
      actor.id,
    );
    expect(
      getDatabase()
        .select()
        .from(nutritionMealAllocationVersions)
        .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entry.id))
        .all(),
    ).toHaveLength(0);
  });

  it('allocates batch and duplicate creations and soft-cancels entries with history', () => {
    const actor = setupOneProfile();
    const [entry] = addMealPlanEntriesWithNutrition(
      {
        entries: [
          {
            plannedFor: '2026-07-21',
            meal: 'dinner',
            recipeId: '',
            title: 'Batch supper',
            servings: 3,
            note: '',
          },
        ],
      },
      actor.id,
    );
    duplicateWeekWithNutrition(
      { weekStart: '2026-07-20', destinationWeekStart: '2026-07-27' },
      actor.id,
    );
    expect(getDatabase().select().from(nutritionMealAllocationVersions).all()).toHaveLength(2);

    removeMealPlanEntryWithNutrition(entry!.id, actor.id);
    expect(
      getDatabase().select().from(mealPlanEntries).where(eq(mealPlanEntries.id, entry!.id)).get(),
    ).toMatchObject({ status: 'cancelled', updatedByProfileId: actor.id });
    expect(
      getDatabase()
        .select()
        .from(nutritionMealAllocationVersions)
        .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entry!.id))
        .all(),
    ).toMatchObject([
      { revision: 1, state: 'planned' },
      { revision: 2, state: 'skipped' },
    ]);
  });

  it('reconciles automatic allocations when an entry is edited, skipped, and removed', () => {
    const actor = setupOneProfile();
    const entry = addMealPlanEntryWithNutrition(
      {
        plannedFor: '2026-07-21',
        meal: 'dinner',
        recipeId: '',
        title: 'Garden bowls',
        servings: 2,
        note: '',
      },
      actor.id,
    );
    const edited = updateMealPlanEntryWithNutrition(
      entry.id,
      {
        plannedFor: entry.plannedFor,
        meal: entry.meal,
        recipeId: '',
        title: 'Garden bowls with herbs',
        servings: 3,
        note: '',
        expectedUpdatedAt: entry.updatedAt.toISOString(),
      },
      actor.id,
    );
    updateMealPlanEntryStatusWithNutrition(entry.id, 'skipped', actor.id);
    removeMealPlanEntryWithNutrition(entry.id, actor.id);

    const allocations = getDatabase()
      .select()
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entry.id))
      .all();
    expect(edited).toMatchObject({ title: 'Garden bowls with herbs', servings: 3 });
    expect(
      allocations.map(({ revision, state, servings }) => ({ revision, state, servings })),
    ).toEqual([
      { revision: 1, state: 'planned', servings: 2 },
      { revision: 2, state: 'planned', servings: 3 },
      { revision: 3, state: 'skipped', servings: 3 },
    ]);
  });

  it('pins a recipe revision until the household explicitly refreshes the planned meal', () => {
    const actor = setupOneProfile();
    const recipeId = '99999999-9999-4999-8999-999999999999';
    const now = new Date('2026-07-21T12:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Original soup',
        summary: '',
        status: 'active',
        servings: '4',
        prepMinutes: 0,
        cookMinutes: 0,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        sourceName: null,
        sourceUrl: null,
        originalAuthor: null,
        cookingMethod: '',
        createdByProfileId: actor.id,
        lastEditedByProfileId: actor.id,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const entry = addMealPlanEntryWithNutrition(
      {
        plannedFor: '2026-07-21',
        meal: 'dinner',
        recipeId,
        title: '',
        servings: 4,
        note: '',
      },
      actor.id,
    );
    getDatabase()
      .update(recipes)
      .set({ title: 'Revised soup', currentRevision: 2, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId))
      .run();

    expect(listPlannedMeals('2026-07-21', '2026-07-21')[0]).toMatchObject({
      id: entry.id,
      recipeTitle: 'Original soup',
      recipeRevision: 1,
      recipeChangedSincePlanning: true,
    });
    expect(refreshMealPlanRecipeSnapshot(entry.id, actor.id)).toMatchObject({
      recipeTitle: 'Revised soup',
      recipeRevision: 2,
      recipeChangedSincePlanning: false,
    });
  });
});
