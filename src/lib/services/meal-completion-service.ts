import 'server-only';
import { ZodError } from 'zod';
import { nutritionWallTime, nutritionEventCandidates } from '@/lib/domain/nutrition-ui';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { ActorContext } from '@/lib/actor-context';
import { getDatabase } from '@/lib/db/client';
import { cookSessions, mealPlanEntries, nutritionMealAllocationVersions } from '@/lib/db/schema';
import { mealCompletionSchema, type MealCompletionInput } from '@/lib/domain/meal-completion';
import { latestMealAllocationVersions } from '@/lib/domain/nutrition-meal-planning';
import { ScannerError } from '@/lib/domain/scanner';
import { resolveNutritionHouseholdContext } from './nutrition-household-profile-service';
import {
  buildConfirmedRecipeConsumptionInput,
  calculateRecipeNutrition,
} from './nutrition-recipe-calculation-service';
import { getRecipeNutritionCalculation } from './nutrition-foundation-service';
import {
  appendNutritionIntakeRevisionInTransaction,
  appendNutritionMealAllocationVersionInTransaction,
} from './nutrition-intake-service';
import { startCookSession, completeCookSession } from './cooking-service';
import {
  getCookSessionPantryPreview,
  confirmCookSessionWithPantry,
} from './pantry-grocery-cooking-service';
import { getRecipe } from './recipe-service';

export function completePlannedRecipe(
  raw: MealCompletionInput,
  actor: ActorContext,
  userId: string,
  occurredAt = new Date(),
) {
  const input = mealCompletionSchema.parse(raw);
  const household = resolveNutritionHouseholdContext(actor);
  const nutritionActor = {
    householdProfileId: household.actor.profileId,
    compatibilityPrincipalId: household.compatibilityPrincipalId,
  };
  return getDatabase().transaction(
    (tx) => {
      const meal = tx
        .select()
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.id, input.mealPlanEntryId))
        .get();
      if (
        !meal ||
        meal.recipeId !== input.recipeId ||
        meal.status !== 'planned' ||
        meal.kind !== 'recipe'
      )
        throw new ScannerError(
          'meal_completion_changed',
          'This planned recipe is no longer available. Refresh the meal planner.',
        );
      const recipe = getRecipe(input.recipeId);
      if (
        !recipe ||
        recipe.status !== 'active' ||
        meal.recipeOverride ||
        (meal.recipeRevision !== null && meal.recipeRevision !== recipe.currentRevision)
      )
        throw new ScannerError(
          'meal_completion_recipe_changed',
          'Review this adapted or older recipe in cooking mode before marking it made.',
        );
      const versions = latestMealAllocationVersions(
        tx
          .select()
          .from(nutritionMealAllocationVersions)
          .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, meal.id))
          .all(),
      );
      const linked = household.householdNutritionProfiles.filter((p) => !p.archivedAt);
      const assignedIds = JSON.parse(meal.profileIds) as string[];
      const people = linked.filter(
        (p) => !assignedIds.length || assignedIds.includes(p.linkedHouseholdProfileId!),
      );
      // Existing explicit allocations remain authoritative even if the planner's people filter changed.
      for (const p of linked)
        if (
          versions.some((v) => v.nutritionProfileId === p.id) &&
          !people.some((v) => v.id === p.id)
        )
          people.push(p);
      if (
        new Set(input.portions.map((p) => p.profileId)).size !== input.portions.length ||
        input.portions.some((p) => !people.some((person) => person.id === p.profileId))
      )
        throw new ScannerError(
          'meal_completion_portions_invalid',
          'Choose each planned household person once.',
          400,
        );
      for (const answer of input.portions)
        if (versions.some((v) => v.nutritionProfileId === answer.profileId))
          throw new ScannerError(
            'meal_completion_portion_changed',
            'This person already has a planned portion. Refresh before saving.',
          );
      const missingPortions = people
        .filter(
          (p) =>
            !versions.some((v) => v.nutritionProfileId === p.id) &&
            !input.portions.some((v) => v.profileId === p.id),
        )
        .map((p) => ({ profileId: p.id, name: p.displayName }));
      const pending = versions.filter(
        (v) =>
          (v.state === 'planned' || v.state === 'served') &&
          people.some((p) => p.id === v.nutritionProfileId),
      );
      let calculationId = meal.recipeCalculationId;
      let nutritionReview: string | null = null;
      if (pending.length || input.portions.length) {
        if (!calculationId) {
          try {
            calculationId = calculateRecipeNutrition(recipe.id).id;
          } catch (error) {
            if (
              !(error instanceof ZodError) ||
              !error.issues.every(
                (issue) => issue.path[0] === 'values' && issue.code === 'too_small',
              )
            )
              throw error;
            nutritionReview =
              'Recipe nutrition is missing. Your portions are saved for review; no nutrient amounts were invented.';
          }
        }
        const calculation = calculationId ? getRecipeNutritionCalculation(calculationId) : null;
        if (
          calculation &&
          (calculation.recipeRevision !== recipe.currentRevision ||
            !calculation.servingCount ||
            !calculation.values.length ||
            (pending.some((p) => p.portionWeightGrams !== null) && !calculation.finalWeightGrams))
        )
          nutritionReview =
            'Review recipe nutrition before logging portions; no nutrient amounts were invented.';
      }
      const prior = tx
        .select()
        .from(cookSessions)
        .where(and(eq(cookSessions.mealPlanEntryId, meal.id), isNotNull(cookSessions.completedAt)))
        .get();
      if (prior && prior.effectiveRevision > 1)
        throw new ScannerError(
          'meal_completion_adapted_cook',
          'This cooked recipe was adapted. Review its nutrition in cooking mode before logging portions.',
        );
      const session =
        prior ??
        startCookSession(recipe.id, household.actor.profileId, meal.servings, meal.id, userId);
      let pantryReview = false;
      if (!prior) {
        const preview = getCookSessionPantryPreview(session.id, household.actor.profileId);
        const required = preview.availability.ingredients.filter((i) => !i.isOptional);
        if (
          required.length &&
          required.every((i) => i.state === 'ready' && i.productId && i.requiredQuantity !== null)
        ) {
          confirmCookSessionWithPantry(
            session.id,
            {
              confirmed: true,
              leftovers: [],
              consumptions: required.map((i) => ({
                productId: i.productId!,
                quantity: i.requiredQuantity!,
                unit: i.unit,
              })),
            },
            household.actor.profileId,
          );
        } else {
          completeCookSession(session.id, household.actor.profileId);
          pantryReview = true;
        }
      }
      if (nutritionReview)
        for (const answer of input.portions) {
          appendNutritionMealAllocationVersionInTransaction(tx, answer.profileId, nutritionActor, {
            mealPlanEntryId: meal.id,
            cookSessionId: null,
            state: 'planned',
            servings: answer.servings,
            portionWeightGrams: null,
            intakeSeriesId: null,
            supersedesAllocationVersionId: null,
            note: 'Confirmed portion awaiting recipe nutrition.',
          });
        }
      let loggedPortions = 0;
      if (!nutritionReview && calculationId) {
        const targets = [
          ...pending.map((v) => ({
            profileId: v.nutritionProfileId,
            servings: v.servings,
            weight: v.portionWeightGrams,
            previous: v,
          })),
          ...input.portions.map((p) => ({
            profileId: p.profileId,
            servings: p.servings,
            weight: null,
            previous: undefined,
          })),
        ];
        for (const target of targets) {
          const person = people.find((p) => p.id === target.profileId)!;
          const slotTime =
            meal.meal === 'breakfast'
              ? '08:00'
              : meal.meal === 'lunch'
                ? '13:00'
                : meal.meal === 'dinner'
                  ? '19:00'
                  : '12:00';
          const intakeTime =
            nutritionWallTime(occurredAt, person.dailyResetTimezone).slice(0, 10) ===
            meal.plannedFor
              ? occurredAt.toISOString()
              : nutritionEventCandidates(
                  `${meal.plannedFor}T${slotTime}`,
                  person.dailyResetTimezone,
                )[0];
          if (!intakeTime)
            throw new ScannerError(
              'meal_completion_date_invalid',
              'Choose a valid local meal date.',
            );
          if (target.servings === null && target.weight === null) {
            nutritionReview = 'A planned portion needs a serving count or weight.';
            continue;
          }
          const intake = appendNutritionIntakeRevisionInTransaction(
            tx,
            target.profileId,
            nutritionActor,
            buildConfirmedRecipeConsumptionInput({
              recipeCalculationId: calculationId,
              servingCount: target.weight === null ? target.servings : null,
              portionWeightGrams: target.weight,
              occurredAt: intakeTime,
              mealSlot: ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.meal)
                ? (meal.meal as 'breakfast' | 'lunch' | 'dinner' | 'snack')
                : 'other',
              supersedesIntakeRevisionId: null,
              revisionReason: '',
            }),
            { mealPlanEntryId: meal.id, cookSessionId: session.id, allowHouseholdTarget: true },
          );
          appendNutritionMealAllocationVersionInTransaction(tx, target.profileId, nutritionActor, {
            mealPlanEntryId: meal.id,
            cookSessionId: target.previous?.cookSessionId ?? null,
            state: 'eaten',
            servings: target.servings,
            portionWeightGrams: target.weight,
            intakeSeriesId: intake.seriesId,
            supersedesAllocationVersionId: target.previous?.id ?? null,
            note: 'Logged existing planned portion when the recipe was marked made.',
          });
          loggedPortions++;
        }
      }
      return {
        cookSessionId: session.id,
        mealPlanEntryId: meal.id,
        alreadyMade: Boolean(prior),
        loggedPortions,
        missingPortions,
        nutritionReview,
        pantryReview,
      };
    },
    { behavior: 'immediate' },
  );
}
