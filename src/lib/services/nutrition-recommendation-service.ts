import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  foodNutritionRecords,
  nutritionInsightFeedback,
  pantryBatches,
  pantryProducts,
  recipeTags,
  recipes,
} from '@/lib/db/schema';
import { pantryExpiryState } from '@/lib/domain/pantry';
import type { NutrientCode } from '@/lib/domain/nutrition';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import {
  nutritionRecommendationFeedbackSchema,
  nutritionRecommendationKey,
  rankNutritionRecommendations,
  type NutritionRecommendationFeedbackInput,
  type RecommendationCandidate,
} from '@/lib/domain/nutrition-recommendations';
import {
  latestNutritionSeries,
  nutritionLocalDateKey,
  summarizeNutritionDiary,
} from '@/lib/domain/nutrition-view';
import { getRecipePantryAvailability } from '@/lib/services/pantry-availability-service';
import { getRecipeNutritionCalculation } from '@/lib/services/nutrition-foundation-service';
import { listNutritionIntakeRevisions } from '@/lib/services/nutrition-intake-service';
import { getNutritionMealProjection } from '@/lib/services/nutrition-meal-planning-service';
import {
  authorizeNutritionProfileAction,
  listNutritionGoalVersions,
  resolveNutritionMutationActor,
} from '@/lib/services/nutrition-profile-service';
import { getRecipeNutritionPresentation } from '@/lib/services/nutrition-recipe-calculation-service';

export class NutritionRecommendationNotFoundError extends Error {}
export class NutritionRecommendationConflictError extends Error {}

function db() {
  ensureDatabase();
  return getDatabase();
}

function normalizedList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLocaleLowerCase())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function currentFeedback(profileId: string) {
  const seen = new Set<string>();
  return db()
    .select()
    .from(nutritionInsightFeedback)
    .where(eq(nutritionInsightFeedback.nutritionProfileId, profileId))
    .orderBy(desc(nutritionInsightFeedback.revision))
    .all()
    .filter((row) => {
      if (seen.has(row.recommendationKey)) return false;
      seen.add(row.recommendationKey);
      return true;
    });
}

function recipeCandidates(
  nutrientCode: string,
  limitCodes: string[],
  allergies: string[],
  exclusions: string[],
  now: Date,
): RecommendationCandidate[] {
  const database = db();
  return database
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(eq(recipes.status, 'active'))
    .all()
    .flatMap((recipe): RecommendationCandidate[] => {
      const presentation = getRecipeNutritionPresentation(recipe.id);
      if (presentation.status !== 'current' || !presentation.calculationId) return [];
      const calculation = getRecipeNutritionCalculation(presentation.calculationId);
      if (!calculation.servingCount) return [];
      const included = calculation.contributions.filter((item) => item.optionalIncluded);
      const recordIds = included.flatMap((item) =>
        item.productNutritionRecordId ? [item.productNutritionRecordId] : [],
      );
      const records = recordIds.length
        ? database
            .select({ id: foodNutritionRecords.id, productId: foodNutritionRecords.productId })
            .from(foodNutritionRecords)
            .where(inArray(foodNutritionRecords.id, recordIds))
            .all()
        : [];
      const productIds = [...new Set(records.map((record) => record.productId))];
      const products = productIds.length
        ? database.select().from(pantryProducts).where(inArray(pantryProducts.id, productIds)).all()
        : [];
      const recipeTagValues = database
        .select({ tag: recipeTags.tag })
        .from(recipeTags)
        .where(eq(recipeTags.recipeId, recipe.id))
        .all()
        .map((item) => item.tag.toLocaleLowerCase());
      const allergyEvidenceComplete =
        allergies.length === 0 ||
        (included.length > 0 &&
          included.every(
            (item) =>
              item.productNutritionRecordId !== null &&
              records.some((record) => record.id === item.productNutritionRecordId),
          ));
      const allergyConflict = products.some((product) =>
        normalizedList(product.allergens).some((allergen) => allergies.includes(allergen)),
      );
      const productTags = products.flatMap((product) => normalizedList(product.dietaryTags));
      const exclusionEvidenceComplete =
        exclusions.length === 0 ||
        (included.length > 0 &&
          products.length > 0 &&
          included.every(
            (item) =>
              item.productNutritionRecordId !== null &&
              records.some((record) => record.id === item.productNutritionRecordId),
          ) &&
          products.every((product) => normalizedList(product.dietaryTags).length > 0));
      const exclusionConflict = exclusions.some(
        (exclusion) => productTags.includes(exclusion) || recipeTagValues.includes(exclusion),
      );
      const amount = (code: string) => {
        const value = calculation.values.find((item) => item.nutrientCode === code);
        return value ? value.amount / calculation.servingCount! : null;
      };
      const availability = getRecipePantryAvailability(recipe.id, calculation.servingCount);
      const shortages = availability.ingredients.flatMap((ingredient) =>
        ingredient.state === 'partial' &&
        ingredient.productId &&
        ingredient.productName &&
        ingredient.shortageQuantity !== null
          ? [
              {
                productId: ingredient.productId,
                productName: ingredient.productName,
                quantity: ingredient.shortageQuantity,
                unit: ingredient.unit,
              },
            ]
          : [],
      );
      const pantryUnknownReasons = availability.ingredients
        .filter((ingredient) => ingredient.state === 'unknown')
        .map((ingredient) => `${ingredient.item}: ${ingredient.reason}`);
      const expiringProductNames = products
        .filter((product) =>
          database
            .select()
            .from(pantryBatches)
            .where(eq(pantryBatches.productId, product.id))
            .all()
            .some(
              (batch) =>
                !['depleted', 'discarded', 'donated'].includes(batch.status) &&
                pantryExpiryState(batch, product.shelfLifeAfterOpeningDays, now).state === 'soon',
            ),
        )
        .map((product) => product.displayName);
      return [
        {
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          calculationId: calculation.id,
          nutrientAmountPerServing: amount(nutrientCode),
          completeness: calculation.completeness,
          confidence: calculation.confidence,
          allergyEvidenceComplete,
          allergyConflict,
          exclusionEvidenceComplete,
          exclusionConflict,
          limitAmountsPerServing: Object.fromEntries(
            limitCodes.map((code) => [code, amount(code)]),
          ),
          pantryState: availability.state,
          expiringProductNames,
          shortages,
          pantryUnknownReasons,
        },
      ];
    });
}

function recommendationRows(
  profileId: string,
  requesterPrincipalId: string,
  now: Date,
  includeDismissed: boolean,
) {
  const profile = authorizeNutritionProfileAction(
    profileId,
    requesterPrincipalId,
    'manage_profile',
  );
  authorizeNutritionProfileAction(profileId, requesterPrincipalId, 'view_diary');
  authorizeNutritionProfileAction(profileId, requesterPrincipalId, 'manage_goals');
  const today = nutritionLocalDateKey(now, profile.dailyResetTimezone);
  const revisions = listNutritionIntakeRevisions(profileId, requesterPrincipalId);
  const summary = summarizeNutritionDiary(revisions, {
    now,
    timeZone: profile.dailyResetTimezone,
  });
  const observedDays = summary.trend.filter((day) => day.entryCount > 0).length;
  const trendDates = new Set(summary.trend.map((day) => day.date));
  const coverage = summary.consumedEntries
    .filter((entry) =>
      trendDates.has(nutritionLocalDateKey(entry.occurredAt, profile.dailyResetTimezone)),
    )
    .flatMap((entry) => entry.values)
    .reduce<Record<string, { total: number; count: number }>>((result, value) => {
      const current = result[value.nutrientCode] ?? { total: 0, count: 0 };
      current.total += value.completeness;
      current.count += 1;
      result[value.nutrientCode] = current;
      return result;
    }, {});
  const dailyAverages = Object.fromEntries(
    Object.entries(summary.sevenDayTotals).map(([code, amount]) => [
      code,
      observedDays > 0 ? amount / observedDays : 0,
    ]),
  );
  const projection = getNutritionMealProjection(profileId, requesterPrincipalId, {
    start: today,
    end: addDays(today, 6),
  });
  const hasExplicitPlan = projection.meals.some((meal) => meal.plannedServings > 0);
  const plannedTotals = Object.values(projection.totalsByDate).reduce<Record<string, number>>(
    (result, values) => {
      for (const [code, amount] of Object.entries(values))
        result[code] = (result[code] ?? 0) + amount;
      return result;
    },
    {},
  );
  const plannedAverages = Object.fromEntries(
    Object.entries(plannedTotals).map(([code, amount]) => [code, amount / 7]),
  );
  const goals = latestNutritionSeries(
    listNutritionGoalVersions(profileId, requesterPrincipalId),
  ).filter(
    (goal) =>
      goal.state === 'active' && goal.startsOn <= today && (!goal.endsOn || goal.endsOn >= today),
  );
  const limitGoals = goals.filter((goal) => goal.kind === 'limit' && goal.maximum !== null);
  const relevantPlannedMeals = projection.meals.filter((meal) => meal.plannedServings > 0);
  const allergies = normalizedList(profile.foodAllergies);
  const exclusions = normalizedList(profile.dietaryExclusions);
  const evidenceDigest = nutritionRecommendationKey({
    today,
    profileVersion: profile.version,
    intake: summary.currentEntries.map((entry) => [entry.id, entry.revision]),
    plan: projection.meals.map((meal) => [
      meal.mealPlanEntryId,
      meal.plannedServings,
      meal.calculationId,
    ]),
  });
  const rows = goals
    .filter(
      (goal) =>
        (goal.kind === 'target' || goal.kind === 'minimum' || goal.kind === 'range') &&
        (goal.value !== null || goal.minimum !== null),
    )
    .flatMap((goal) => {
      if (goal.kind === 'limit') return [];
      const goalKind: 'target' | 'minimum' | 'range' = goal.kind;
      const boundary = goal.kind === 'range' ? goal.minimum! : goal.value!;
      const nutrientCoverage = coverage[goal.nutrientCode];
      const recurringQualified =
        observedDays >= 3 &&
        Boolean(nutrientCoverage && nutrientCoverage.total / nutrientCoverage.count >= 0.5);
      const candidates = recipeCandidates(
        goal.nutrientCode,
        limitGoals.map((limit) => limit.nutrientCode),
        allergies,
        exclusions,
        now,
      );
      const goalNutrientCode = goal.nutrientCode as NutrientCode;
      const plannedQualified =
        hasExplicitPlan &&
        relevantPlannedMeals.every(
          (meal) =>
            meal.calculationStatus === 'current' &&
            meal.completeness !== null &&
            meal.completeness >= 0.5 &&
            meal.confidence !== null &&
            meal.confidence >= 0.5 &&
            meal.plannedValues?.[goalNutrientCode] !== undefined &&
            limitGoals.every(
              (limit) => meal.plannedValues?.[limit.nutrientCode as NutrientCode] !== undefined,
            ),
        );
      const build = (kind: 'recurring_gap' | 'planned_gap', currentAmount: number) =>
        rankNutritionRecommendations({
          profileId,
          kind,
          nutrientCode: goal.nutrientCode,
          goalKind,
          goalBoundary: boundary,
          goalVersionId: goal.id,
          currentAmount,
          unit: goal.unit,
          evidenceDigest,
          limits: Object.fromEntries(
            limitGoals.map((limit) => [
              limit.nutrientCode,
              {
                currentAmount:
                  kind === 'planned_gap'
                    ? (plannedAverages[limit.nutrientCode] ?? 0)
                    : (dailyAverages[limit.nutrientCode] ?? 0),
                maximum: limit.maximum!,
              },
            ]),
          ),
          candidates,
          maximumResults: 2,
        });
      return [
        ...(recurringQualified
          ? build('recurring_gap', dailyAverages[goal.nutrientCode] ?? 0)
          : []),
        ...(plannedQualified && plannedTotals[goal.nutrientCode] !== undefined
          ? build('planned_gap', plannedAverages[goal.nutrientCode] ?? 0)
          : []),
      ];
    });
  const feedback = currentFeedback(profileId);
  return rows
    .filter(
      (row, index, all) =>
        all.findIndex((candidate) => candidate.key === row.key) === index &&
        (includeDismissed ||
          feedback.find((item) => item.recommendationKey === row.key)?.state !== 'dismissed'),
    )
    .slice(0, 8)
    .map((row) => ({
      ...row,
      feedback: feedback.find((item) => item.recommendationKey === row.key) ?? null,
    }));
}

export function getNutritionRecommendations(
  profileId: string,
  requesterPrincipalId: string,
  now = new Date(),
) {
  return recommendationRows(profileId, requesterPrincipalId, now, false);
}

export function appendNutritionRecommendationFeedback(
  profileId: string,
  actorInput: NutritionMutationActorInput,
  recommendationKey: string,
  raw: NutritionRecommendationFeedbackInput,
  now = new Date(),
) {
  const input = nutritionRecommendationFeedbackSchema.parse(raw);
  const actor = resolveNutritionMutationActor(actorInput);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  const key = recommendationKey.trim().toLocaleLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(key))
    throw new NutritionRecommendationNotFoundError('Recommendation was not found.');
  const recommendation = recommendationRows(profileId, requesterPrincipalId, now, true).find(
    (item) => item.key === key,
  );
  if (!recommendation)
    throw new NutritionRecommendationNotFoundError(
      'This recommendation evidence changed. Refresh before recording feedback.',
    );
  return db().transaction((transaction) => {
    resolveNutritionMutationActor(actor, transaction);
    const latest = transaction
      .select()
      .from(nutritionInsightFeedback)
      .where(
        and(
          eq(nutritionInsightFeedback.nutritionProfileId, profileId),
          eq(nutritionInsightFeedback.recommendationKey, key),
        ),
      )
      .orderBy(desc(nutritionInsightFeedback.revision))
      .get();
    if (
      latest &&
      latest.state === input.state &&
      latest.reason === input.reason &&
      latest.supersedesFeedbackId === input.supersedesFeedbackId
    )
      return latest;
    if (
      (latest && latest.id !== input.supersedesFeedbackId) ||
      (!latest && input.supersedesFeedbackId !== null)
    )
      throw new NutritionRecommendationConflictError(
        'Recommendation feedback changed concurrently. Refresh before saving.',
      );
    const row = {
      id: randomUUID(),
      nutritionProfileId: profileId,
      recommendationKey: key,
      revision: (latest?.revision ?? 0) + 1,
      state: input.state,
      reason: input.reason,
      supersedesFeedbackId: latest?.id ?? null,
      createdByPrincipalId: requesterPrincipalId,
      actorHouseholdProfileId: actor.householdProfileId,
      createdAt: now,
    } satisfies typeof nutritionInsightFeedback.$inferInsert;
    transaction.insert(nutritionInsightFeedback).values(row).run();
    return row;
  });
}
