import 'server-only';

import { z } from 'zod';

import { ensureDatabase, getSqliteDatabase } from '@/lib/db/client';
import { NUTRIENT_CODES } from '@/lib/domain/nutrition';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import { getNutritionDiaryAccessContext } from '@/lib/services/nutrition-profile-service';

const inputSchema = z.object({
  endDate: z.string().date(),
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  selectedNutrients: z.array(z.enum(NUTRIENT_CODES)).min(1).max(12),
});

type IntakeJoinedRow = {
  id: string;
  series_id: string;
  occurred_at: number;
  meal_slot: string;
  source_type: 'recipe' | 'product' | 'manual';
  source_name_snapshot: string;
  recipe_id: string | null;
  product_id: string | null;
  nutrient_code: string | null;
  amount: number | null;
  confidence: number | null;
  completeness: number | null;
  estimated: number | null;
};

type PlanJoinedRow = {
  allocation_id: string;
  planned_for: string;
  meal: string;
  servings: number | null;
  calculation_id: string | null;
  serving_count: number | null;
  calculation_completeness: number | null;
  nutrient_code: string | null;
  amount: number | null;
};

type GoalRow = {
  id: string;
  series_id: string;
  revision: number;
  nutrient_code: string;
  unit: string;
  source_type: string;
  starts_on: string;
  ends_on: string | null;
  state: string;
  kind: 'target' | 'minimum' | 'range' | 'limit';
  value: number | null;
  minimum: number | null;
  maximum: number | null;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function getIndividualNutritionChartWorkspace(
  profileId: string,
  requesterPrincipalId: string,
  rawInput: unknown,
) {
  const input = inputSchema.parse(rawInput);
  const selectedNutrients = [...new Set(input.selectedNutrients)];
  const requiredCodes = [
    ...new Set([
      'energy_kcal',
      'protein',
      'carbohydrate',
      'total_fat',
      'alcohol',
      ...selectedNutrients,
    ]),
  ];
  ensureDatabase();
  const access = getNutritionDiaryAccessContext(profileId, requesterPrincipalId);
  const sqlite = getSqliteDatabase();
  const startDate = addDays(input.endDate, 1 - input.days);
  const exactDates = new Set(
    Array.from({ length: input.days }, (_, index) => addDays(startDate, index)),
  );
  const envelopeStart = Math.floor(
    (Date.parse(`${startDate}T00:00:00Z`) - 36 * 60 * 60 * 1_000) / 1_000,
  );
  const envelopeEnd = Math.floor(
    (Date.parse(`${input.endDate}T23:59:59Z`) + 36 * 60 * 60 * 1_000) / 1_000,
  );
  const placeholders = requiredCodes.map(() => '?').join(',');
  const intakeRows = sqlite
    .prepare(
      `SELECT r.id,r.series_id,r.occurred_at,r.meal_slot,r.source_type,
              r.source_name_snapshot,r.recipe_id,r.product_id,
              v.nutrient_code,v.amount,v.confidence,v.completeness,v.estimated
       FROM nutrition_intake_revisions r
       LEFT JOIN nutrition_intake_nutrient_values v
         ON v.intake_revision_id=r.id AND v.nutrient_code IN (${placeholders})
       WHERE r.nutrition_profile_id=?
         AND r.occurred_at BETWEEN ? AND ?
         AND r.state IN ('eaten','corrected')
         AND NOT EXISTS (
           SELECT 1 FROM nutrition_intake_revisions newer
           WHERE newer.series_id=r.series_id AND newer.revision>r.revision
         )
       ORDER BY r.occurred_at,r.id,v.nutrient_code`,
    )
    .all(...requiredCodes, profileId, envelopeStart, envelopeEnd) as IntakeJoinedRow[];

  const entries = new Map<
    string,
    {
      id: string;
      seriesId: string;
      localDate: string;
      mealSlot: string;
      sourceType: 'recipe' | 'product' | 'manual';
      sourceName: string;
      recipeId: string | null;
      productId: string | null;
      values: Array<{
        nutrientCode: string;
        amount: number;
        confidence: number;
        completeness: number;
        estimated: boolean;
      }>;
    }
  >();
  for (const row of intakeRows) {
    const occurredAt = new Date(row.occurred_at * 1_000);
    const localDate = nutritionLocalDateKey(occurredAt, access.profile.dailyResetTimezone);
    if (!exactDates.has(localDate)) continue;
    const entry = entries.get(row.id) ?? {
      id: row.id,
      seriesId: row.series_id,
      localDate,
      mealSlot: row.meal_slot,
      sourceType: row.source_type,
      sourceName: row.source_name_snapshot,
      recipeId: row.recipe_id,
      productId: row.product_id,
      values: [],
    };
    if (row.nutrient_code !== null && row.amount !== null) {
      entry.values.push({
        nutrientCode: row.nutrient_code,
        amount: row.amount,
        confidence: row.confidence ?? 0,
        completeness: row.completeness ?? 0,
        estimated: Boolean(row.estimated),
      });
    }
    entries.set(row.id, entry);
  }

  const planRows = access.profile.showPlannedNutrition
    ? (sqlite
        .prepare(
          `SELECT a.id AS allocation_id,m.planned_for,m.meal,a.servings,
              c.id AS calculation_id,c.serving_count,
              c.completeness AS calculation_completeness,
              v.nutrient_code,v.amount
       FROM nutrition_meal_allocation_versions a
       JOIN meal_plan_entries m ON m.id=a.meal_plan_entry_id
       LEFT JOIN recipes r ON r.id=m.recipe_id
       LEFT JOIN recipe_nutrition_calculations c ON c.id=(
         SELECT current_calculation.id FROM recipe_nutrition_calculations current_calculation
         WHERE current_calculation.recipe_id=r.id
           AND current_calculation.recipe_revision=r.current_revision
         ORDER BY current_calculation.revision DESC LIMIT 1
       )
       LEFT JOIN recipe_nutrient_values v
         ON v.calculation_id=c.id AND v.nutrient_code IN (${placeholders})
       WHERE a.nutrition_profile_id=?
         AND m.planned_for BETWEEN ? AND ?
         AND m.status='planned'
         AND a.state IN ('planned','served')
         AND NOT EXISTS (
           SELECT 1 FROM nutrition_meal_allocation_versions newer
           WHERE newer.series_id=a.series_id AND newer.revision>a.revision
         )
       ORDER BY m.planned_for,m.meal,a.id,v.nutrient_code`,
        )
        .all(...requiredCodes, profileId, startDate, input.endDate) as PlanJoinedRow[])
    : [];
  const plans = new Map<
    string,
    {
      id: string;
      date: string;
      meal: string;
      servings: number | null;
      completeness: number | null;
      unavailableReason: string | null;
      values: Array<{ nutrientCode: string; amount: number }>;
    }
  >();
  for (const row of planRows) {
    const usable =
      row.calculation_id !== null &&
      row.serving_count !== null &&
      row.serving_count > 0 &&
      row.servings !== null &&
      row.servings > 0;
    const plan = plans.get(row.allocation_id) ?? {
      id: row.allocation_id,
      date: row.planned_for,
      meal: row.meal,
      servings: row.servings,
      completeness: row.calculation_completeness,
      unavailableReason: usable
        ? null
        : 'No current calculation with an unambiguous serving count is available.',
      values: [],
    };
    if (usable && row.nutrient_code !== null && row.amount !== null) {
      plan.values.push({
        nutrientCode: row.nutrient_code,
        amount: row.amount * (row.servings! / row.serving_count!),
      });
    }
    plans.set(row.allocation_id, plan);
  }

  const goalRows = access.canManageGoals
    ? (sqlite
        .prepare(
          `SELECT id,series_id,revision,nutrient_code,unit,source_type,starts_on,ends_on,
                  state,kind,value,minimum,maximum
           FROM nutrition_goal_versions
           WHERE nutrition_profile_id=? AND nutrient_code IN (${placeholders})
           ORDER BY series_id,revision`,
        )
        .all(profileId, ...requiredCodes) as GoalRow[])
    : [];

  return {
    profileLabel: access.profile.displayName,
    timeZone: access.profile.dailyResetTimezone,
    startDate,
    endDate: input.endDate,
    days: input.days,
    showPlannedNutrition: access.profile.showPlannedNutrition,
    selectedNutrients,
    goalContext: access.canManageGoals ? ('available' as const) : ('unavailable' as const),
    entries: [...entries.values()],
    plans: [...plans.values()],
    goals: goalRows.map((row) => ({
      id: row.id,
      seriesId: row.series_id,
      revision: row.revision,
      nutrientCode: row.nutrient_code,
      unit: row.unit,
      sourceType: row.source_type,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      state: row.state,
      kind: row.kind,
      value: row.value,
      minimum: row.minimum,
      maximum: row.maximum,
    })),
  };
}

export type IndividualNutritionChartWorkspace = ReturnType<
  typeof getIndividualNutritionChartWorkspace
>;
