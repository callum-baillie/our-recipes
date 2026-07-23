import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { getDatabase } from '@/lib/db/client';
import { nutritionMealAllocationVersions, nutritionProfiles } from '@/lib/db/schema';
import type {
  DuplicateWeekInput,
  MealPlanBatchInput,
  MealPlanEntryInput,
  MealPlanEntryUpdateInput,
  MealPlanStatus,
} from '@/lib/domain/planning';
import { listProfiles } from '@/lib/services/household-service';
import { appendNutritionMealAllocationVersionInTransaction } from '@/lib/services/nutrition-intake-service';
import {
  addMealPlanEntries,
  addMealPlanEntry,
  duplicateWeek,
  removeMealPlanEntry,
  type MealPlanEntriesInserted,
  type MealPlanEntryChanged,
  updateMealPlanEntry,
  updateMealPlanEntryStatus,
} from '@/lib/services/planning-service';

function automaticNutritionProfile() {
  const householdProfiles = listProfiles();
  if (householdProfiles.length !== 1) return null;
  const householdProfile = householdProfiles[0]!;
  const nutritionProfile = getDatabase()
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.linkedHouseholdProfileId, householdProfile.id))
    .get();
  if (!nutritionProfile || nutritionProfile.archivedAt) return null;
  return { householdProfile, nutritionProfile };
}

export function automaticAllocationHook(): MealPlanEntriesInserted | undefined {
  const automatic = automaticNutritionProfile();
  if (!automatic) return undefined;
  const { householdProfile, nutritionProfile } = automatic;

  return (transaction, entries) => {
    for (const entry of entries) {
      if (entry.status !== 'planned') continue;
      appendNutritionMealAllocationVersionInTransaction(
        transaction,
        nutritionProfile.id,
        {
          householdProfileId: householdProfile.id,
          compatibilityPrincipalId: nutritionProfile.ownerPrincipalId,
        },
        {
          mealPlanEntryId: entry.id,
          cookSessionId: null,
          state: 'planned',
          servings: entry.servings,
          portionWeightGrams: null,
          intakeSeriesId: null,
          supersedesAllocationVersionId: null,
          note: 'Automatically assigned because the household has one active profile.',
        },
      );
    }
  };
}

function automaticAllocationChangeHook(): MealPlanEntryChanged | undefined {
  const automatic = automaticNutritionProfile();
  if (!automatic) return undefined;
  const { householdProfile, nutritionProfile } = automatic;
  return (transaction, previous, next) => {
    const latest = transaction
      .select()
      .from(nutritionMealAllocationVersions)
      .where(
        and(
          eq(nutritionMealAllocationVersions.mealPlanEntryId, previous.id),
          eq(nutritionMealAllocationVersions.nutritionProfileId, nutritionProfile.id),
        ),
      )
      .orderBy(desc(nutritionMealAllocationVersions.revision))
      .get();
    const nextState = next?.status === 'planned' ? 'planned' : 'skipped';
    if (!latest && nextState === 'skipped') return;
    const servings = next?.servings ?? latest?.servings ?? previous.servings;
    if (latest?.state === nextState && latest.servings === servings) return;
    appendNutritionMealAllocationVersionInTransaction(
      transaction,
      nutritionProfile.id,
      {
        householdProfileId: householdProfile.id,
        compatibilityPrincipalId: nutritionProfile.ownerPrincipalId,
      },
      {
        mealPlanEntryId: previous.id,
        cookSessionId: null,
        state: nextState,
        servings,
        portionWeightGrams: null,
        intakeSeriesId: null,
        supersedesAllocationVersionId: latest?.id ?? null,
        note:
          nextState === 'planned'
            ? 'Automatically updated with the one-profile meal plan.'
            : 'Automatically released when the planned meal was skipped, cancelled, or removed.',
      },
    );
  };
}

export function addMealPlanEntryWithNutrition(input: MealPlanEntryInput, actorProfileId: string) {
  return addMealPlanEntry(input, actorProfileId, automaticAllocationHook());
}

export function updateMealPlanEntryWithNutrition(
  entryId: string,
  input: MealPlanEntryUpdateInput,
  actorProfileId: string,
) {
  return updateMealPlanEntry(entryId, input, actorProfileId, automaticAllocationChangeHook());
}

export function updateMealPlanEntryStatusWithNutrition(
  entryId: string,
  status: MealPlanStatus,
  actorProfileId: string,
) {
  return updateMealPlanEntryStatus(
    entryId,
    status,
    actorProfileId,
    automaticAllocationChangeHook(),
  );
}

export function removeMealPlanEntryWithNutrition(entryId: string, actorProfileId: string) {
  return removeMealPlanEntry(entryId, actorProfileId, automaticAllocationChangeHook());
}

export function addMealPlanEntriesWithNutrition(input: MealPlanBatchInput, actorProfileId: string) {
  return addMealPlanEntries(input, actorProfileId, automaticAllocationHook());
}

export function duplicateWeekWithNutrition(input: DuplicateWeekInput, actorProfileId: string) {
  return duplicateWeek(input, actorProfileId, automaticAllocationHook());
}
