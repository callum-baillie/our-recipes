import 'server-only';

import { ensureDatabase, getSqliteDatabase } from '@/lib/db/client';
import {
  addNutrientAmounts,
  allocationCountsAsPlanned,
  mealAllocationCapacity,
  nutritionMealProjectionRangeSchema,
  scaleMealNutrients,
  type MealAllocationState,
} from '@/lib/domain/nutrition-meal-planning';
import { presentRecipeNutrition } from '@/lib/domain/nutrition-recipe-presentation';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import type { NutrientAmounts } from '@/lib/domain/nutrition';
import { NutritionIntakeForbiddenError } from '@/lib/services/nutrition-intake-service';
import {
  NutritionProfileForbiddenError,
  getNutritionDiaryAccessContext,
} from '@/lib/services/nutrition-profile-service';

type MealRow = {
  meal_plan_entry_id: string;
  planned_for: string;
  meal: string;
  freeform_title: string;
  total_servings: number;
  recipe_id: string | null;
  recipe_title: string | null;
  current_recipe_revision: number | null;
  calculation_id: string | null;
  calculation_recipe_revision: number | null;
  calculation_revision: number | null;
  serving_count: number | null;
  confidence: number | null;
  completeness: number | null;
  notes: string | null;
  calculated_at: number | null;
  source_name: string | null;
  source_provider: string | null;
  source_version: string | null;
  algorithm: string | null;
  algorithm_version: string | null;
  energy_factors_version: string | null;
  nutrient_code: string | null;
  amount: number | null;
  value_confidence: number | null;
  value_completeness: number | null;
};

type AllocationRow = {
  id: string;
  series_id: string;
  revision: number;
  nutrition_profile_id: string;
  meal_plan_entry_id: string;
  state: MealAllocationState;
  servings: number | null;
  note: string;
};

type IntakeRow = {
  id: string;
  occurred_at: number;
  nutrient_code: string | null;
  amount: number | null;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export type NutritionMealProjection = {
  range: { start: string; end: string };
  meals: Array<{
    mealPlanEntryId: string;
    plannedFor: string;
    meal: string;
    title: string;
    recipeId: string | null;
    totalServings: number;
    assignedServings: number;
    unassignedServings: number;
    overallocatedServings: number;
    ownAllocations: Array<{
      id: string;
      seriesId: string;
      revision: number;
      state: MealAllocationState;
      servings: number | null;
      note: string;
    }>;
    plannedServings: number;
    calculationStatus: 'current' | 'stale' | 'unavailable';
    calculationId: string | null;
    confidence: number | null;
    completeness: number | null;
    warnings: string[];
    plannedValues: Record<string, number> | null;
  }>;
  totalsByDate: Record<string, Record<string, number>>;
  confirmedTotalsByDate?: Record<string, Record<string, number>>;
};

export function getNutritionMealProjection(
  profileId: string,
  requesterPrincipalId: string,
  rawRange: unknown,
): NutritionMealProjection {
  const range = nutritionMealProjectionRangeSchema.parse(rawRange);
  ensureDatabase();
  let access: ReturnType<typeof getNutritionDiaryAccessContext>;
  try {
    access = getNutritionDiaryAccessContext(profileId, requesterPrincipalId);
  } catch (error) {
    if (error instanceof NutritionProfileForbiddenError) {
      throw new NutritionIntakeForbiddenError('Nutrition diary access was not granted.');
    }
    throw error;
  }
  const sqlite = getSqliteDatabase();
  const mealRows = sqlite
    .prepare(
      `SELECT m.id AS meal_plan_entry_id,m.planned_for,m.meal,
              m.title AS freeform_title,m.servings AS total_servings,
              r.id AS recipe_id,r.title AS recipe_title,
              COALESCE(m.recipe_revision,r.current_revision) AS current_recipe_revision,
              c.id AS calculation_id,c.recipe_revision AS calculation_recipe_revision,
              c.revision AS calculation_revision,c.serving_count,c.confidence,c.completeness,
              c.notes,c.created_at AS calculated_at,
              s.name AS source_name,s.provider AS source_provider,s.version AS source_version,
              cv.algorithm,cv.version AS algorithm_version,cv.energy_factors_version,
              v.nutrient_code,v.amount,v.confidence AS value_confidence,
              v.completeness AS value_completeness
       FROM meal_plan_entries m
       LEFT JOIN recipes r ON r.id=m.recipe_id
       LEFT JOIN recipe_nutrition_calculations c ON c.id=COALESCE(
         m.recipe_calculation_id,
         (SELECT latest.id FROM recipe_nutrition_calculations latest
          WHERE latest.recipe_id=r.id ORDER BY latest.revision DESC LIMIT 1)
       )
       LEFT JOIN nutrition_data_sources s ON s.id=c.source_id
       LEFT JOIN nutrition_calculation_versions cv ON cv.id=c.calculation_version_id
       LEFT JOIN recipe_nutrient_values v ON v.calculation_id=c.id
       WHERE m.planned_for BETWEEN ? AND ? AND m.status='planned'
       ORDER BY m.planned_for,m.meal,m.id,v.nutrient_code`,
    )
    .all(range.start, range.end) as MealRow[];
  const allocationRows = sqlite
    .prepare(
      `SELECT a.id,a.series_id,a.revision,a.nutrition_profile_id,
              a.meal_plan_entry_id,a.state,a.servings,a.note
       FROM nutrition_meal_allocation_versions a
       JOIN meal_plan_entries m ON m.id=a.meal_plan_entry_id
       WHERE m.planned_for BETWEEN ? AND ? AND m.status='planned'
         AND NOT EXISTS (
           SELECT 1 FROM nutrition_meal_allocation_versions newer
           WHERE newer.series_id=a.series_id AND newer.revision>a.revision
         )
       ORDER BY a.meal_plan_entry_id,a.series_id`,
    )
    .all(range.start, range.end) as AllocationRow[];

  const dates: string[] = [];
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) dates.push(date);
  const exactDates = new Set(dates);
  const envelopeStart = Math.floor(
    (Date.parse(`${range.start}T00:00:00Z`) - 36 * 60 * 60 * 1_000) / 1_000,
  );
  const envelopeEnd = Math.floor(
    (Date.parse(`${range.end}T23:59:59Z`) + 36 * 60 * 60 * 1_000) / 1_000,
  );
  const intakeRows = sqlite
    .prepare(
      `SELECT r.id,r.occurred_at,v.nutrient_code,v.amount
       FROM nutrition_intake_revisions r
       LEFT JOIN nutrition_intake_nutrient_values v ON v.intake_revision_id=r.id
       WHERE r.nutrition_profile_id=? AND r.occurred_at BETWEEN ? AND ?
         AND r.state IN ('eaten','corrected')
         AND NOT EXISTS (
           SELECT 1 FROM nutrition_intake_revisions newer
           WHERE newer.series_id=r.series_id AND newer.revision>r.revision
         )
       ORDER BY r.occurred_at,r.id,v.nutrient_code`,
    )
    .all(profileId, envelopeStart, envelopeEnd) as IntakeRow[];
  const confirmedTotalsByDate: Record<string, NutrientAmounts> = {};
  for (const row of intakeRows) {
    if (row.nutrient_code === null || row.amount === null) continue;
    const localDate = nutritionLocalDateKey(
      new Date(row.occurred_at * 1_000),
      access.profile.dailyResetTimezone,
    );
    if (!exactDates.has(localDate)) continue;
    const totals = confirmedTotalsByDate[localDate] ?? {};
    const nutrientCode = row.nutrient_code as keyof NutrientAmounts;
    totals[nutrientCode] = (totals[nutrientCode] ?? 0) + row.amount;
    confirmedTotalsByDate[localDate] = totals;
  }

  const groupedMeals = new Map<string, MealRow[]>();
  for (const row of mealRows) {
    const rows = groupedMeals.get(row.meal_plan_entry_id) ?? [];
    rows.push(row);
    groupedMeals.set(row.meal_plan_entry_id, rows);
  }
  const totalsByDate: Record<string, NutrientAmounts> = {};
  const meals = [...groupedMeals.values()].map((rows) => {
    const first = rows[0]!;
    const allAllocations = allocationRows.filter(
      (allocation) => allocation.meal_plan_entry_id === first.meal_plan_entry_id,
    );
    const ownAllocations = allAllocations
      .filter((allocation) => allocation.nutrition_profile_id === profileId)
      .map((allocation) => ({
        id: allocation.id,
        seriesId: allocation.series_id,
        revision: allocation.revision,
        state: allocation.state,
        servings: allocation.servings,
        note: allocation.note,
      }));
    const capacity = mealAllocationCapacity(
      first.total_servings,
      allAllocations.map((allocation) => ({
        id: allocation.id,
        seriesId: allocation.series_id,
        revision: allocation.revision,
        state: allocation.state,
        servings: allocation.servings,
      })),
    );
    const plannedServings = ownAllocations
      .filter((allocation) => allocationCountsAsPlanned(allocation.state))
      .reduce((total, allocation) => total + (allocation.servings ?? 0), 0);
    const values = rows.flatMap((row) =>
      row.nutrient_code === null || row.amount === null
        ? []
        : [{ nutrientCode: row.nutrient_code, amount: row.amount }],
    );
    const calculation =
      first.calculation_id === null
        ? null
        : {
            id: first.calculation_id,
            recipeRevision: first.calculation_recipe_revision!,
            revision: first.calculation_revision!,
            servingCount: first.serving_count,
            confidence: first.confidence!,
            completeness: first.completeness!,
            createdAt: new Date(first.calculated_at! * 1_000),
            source: {
              name: first.source_name!,
              provider: first.source_provider!,
              version: first.source_version!,
            },
            calculationVersion: {
              algorithm: first.algorithm!,
              version: first.algorithm_version!,
              energyFactorsVersion: first.energy_factors_version!,
            },
            values: rows.flatMap((row) =>
              row.nutrient_code === null || row.amount === null
                ? []
                : [
                    {
                      nutrientCode: row.nutrient_code,
                      amount: row.amount,
                      confidence: row.value_confidence,
                      completeness: row.value_completeness,
                    },
                  ],
            ),
            notes: first.notes!,
          };
    const presentation = presentRecipeNutrition(first.current_recipe_revision ?? 0, calculation);
    const plannedValues =
      presentation.status === 'current'
        ? scaleMealNutrients(values, first.serving_count, plannedServings)
        : null;
    if (plannedValues) {
      totalsByDate[first.planned_for] = addNutrientAmounts(
        totalsByDate[first.planned_for] ?? {},
        plannedValues,
      );
    }
    return {
      mealPlanEntryId: first.meal_plan_entry_id,
      plannedFor: first.planned_for,
      meal: first.meal,
      title: first.recipe_title ?? first.freeform_title,
      recipeId: first.recipe_id,
      totalServings: first.total_servings,
      assignedServings: capacity.assignedServings,
      unassignedServings: capacity.unassignedServings,
      overallocatedServings: capacity.overallocatedServings,
      ownAllocations,
      plannedServings,
      calculationStatus: presentation.status,
      calculationId: presentation.calculationId,
      confidence: presentation.confidence,
      completeness: presentation.completeness,
      warnings: presentation.warnings,
      plannedValues,
    };
  });

  return {
    range,
    meals,
    totalsByDate: totalsByDate as Record<string, Record<string, number>>,
    confirmedTotalsByDate: confirmedTotalsByDate as Record<string, Record<string, number>>,
  };
}
