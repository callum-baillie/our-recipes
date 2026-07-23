import { z } from 'zod';

import type { NutrientAmounts, NutrientCode } from '@/lib/domain/nutrition';

export const nutritionMealProjectionRangeSchema = z
  .object({
    start: z.string().date(),
    end: z.string().date(),
  })
  .strict()
  .superRefine((value, context) => {
    const start = Date.parse(`${value.start}T00:00:00Z`);
    const end = Date.parse(`${value.end}T00:00:00Z`);
    const days = (end - start) / 86_400_000;
    if (end < start || days > 31) {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Choose a forward date range no longer than 31 days.',
      });
    }
  });

export type MealAllocationState = 'planned' | 'served' | 'eaten' | 'skipped' | 'leftover';

export type AllocationVersion = {
  id: string;
  seriesId: string;
  revision: number;
  state: MealAllocationState;
  servings: number | null;
};

export function latestMealAllocationVersions<T extends AllocationVersion>(versions: T[]): T[] {
  const latest = new Map<string, T>();
  for (const version of versions) {
    const previous = latest.get(version.seriesId);
    if (!previous || version.revision > previous.revision) latest.set(version.seriesId, version);
  }
  return [...latest.values()];
}

export function allocationOccupiesServing(state: MealAllocationState): boolean {
  return state !== 'skipped';
}

export function allocationCountsAsPlanned(state: MealAllocationState): boolean {
  return state === 'planned' || state === 'served';
}

export function mealAllocationCapacity(
  totalServings: number,
  versions: AllocationVersion[],
  replacingSeriesId: string | null = null,
) {
  const assignedServings = latestMealAllocationVersions(versions)
    .filter(
      (allocation) =>
        allocation.seriesId !== replacingSeriesId && allocationOccupiesServing(allocation.state),
    )
    .reduce((total, allocation) => total + (allocation.servings ?? 0), 0);
  return {
    assignedServings,
    unassignedServings: Math.max(0, totalServings - assignedServings),
    overallocatedServings: Math.max(0, assignedServings - totalServings),
  };
}

export function scaleMealNutrients(
  values: ReadonlyArray<{ nutrientCode: string; amount: number }>,
  calculationServingCount: number | null,
  allocatedServings: number,
): NutrientAmounts | null {
  if (!calculationServingCount || calculationServingCount <= 0) return null;
  const multiplier = allocatedServings / calculationServingCount;
  return Object.fromEntries(
    values.map((value) => [value.nutrientCode, value.amount * multiplier]),
  ) as NutrientAmounts;
}

export function addNutrientAmounts(left: NutrientAmounts, right: NutrientAmounts): NutrientAmounts {
  const result: NutrientAmounts = { ...left };
  for (const [code, amount] of Object.entries(right)) {
    if (amount === undefined) continue;
    const nutrientCode = code as NutrientCode;
    result[nutrientCode] = (result[nutrientCode] ?? 0) + amount;
  }
  return result;
}

export function plannedConsumedDifference(
  planned: NutrientAmounts,
  consumed: NutrientAmounts,
): NutrientAmounts {
  const codes = new Set([...Object.keys(planned), ...Object.keys(consumed)] as NutrientCode[]);
  return Object.fromEntries(
    [...codes].map((code) => [code, (planned[code] ?? 0) - (consumed[code] ?? 0)]),
  ) as NutrientAmounts;
}
