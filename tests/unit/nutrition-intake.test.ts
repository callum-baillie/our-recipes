import { describe, expect, it } from 'vitest';

import {
  nutritionIntakeRevisionInputSchema,
  nutritionMealAllocationInputSchema,
} from '@/lib/domain/nutrition-intake';

const sourceId = 'manual-household-label';
const provenance = {
  sourceIds: [sourceId],
  sourceDetails: [
    {
      id: sourceId,
      name: 'Household label',
      provider: 'Our Recipes',
      version: '1',
    },
  ],
  calculationVersionId: null,
  sourceDigest: 'manual:portion:2026-07-19',
  basisType: 'manual_portion' as const,
  basisAmount: 1,
  basisUnit: 'bowl',
  confidence: 0.7,
  completeness: 0.4,
  estimated: true,
};

describe('Nutrition intake contracts', () => {
  it('accepts a sparse explicit eaten snapshot with frozen provenance', () => {
    expect(
      nutritionIntakeRevisionInputSchema.parse({
        occurredAt: '2026-07-19T12:30:00-07:00',
        mealSlot: 'lunch',
        state: 'eaten',
        sourceType: 'manual',
        sourceNameSnapshot: 'Lentil soup',
        quantity: 1,
        unit: 'bowl',
        provenance,
        values: [
          {
            nutrientCode: 'energy_kcal',
            amount: 420,
            sourceIds: [sourceId],
            confidence: 0.7,
            completeness: 0.4,
            estimated: true,
          },
        ],
      }),
    ).toMatchObject({ state: 'eaten', values: [{ nutrientCode: 'energy_kcal' }] });
  });

  it('keeps skipped and deleted revisions out of consumed totals', () => {
    expect(() =>
      nutritionIntakeRevisionInputSchema.parse({
        occurredAt: '2026-07-19T12:30:00-07:00',
        mealSlot: 'lunch',
        state: 'skipped',
        sourceType: 'manual',
        provenance,
        values: [
          {
            nutrientCode: 'energy_kcal',
            amount: 420,
            sourceIds: [sourceId],
            confidence: 0.7,
            completeness: 0.4,
            estimated: true,
          },
        ],
      }),
    ).toThrow(/cannot carry consumed nutrient totals/iu);
    expect(
      nutritionIntakeRevisionInputSchema.parse({
        occurredAt: '2026-07-19T12:30:00-07:00',
        mealSlot: 'lunch',
        state: 'skipped',
        sourceType: 'manual',
      }).values,
    ).toEqual([]);
  });

  it('requires calculation identity for recipe intake and consistent nutrient sources', () => {
    expect(() =>
      nutritionIntakeRevisionInputSchema.parse({
        occurredAt: '2026-07-19T12:30:00-07:00',
        mealSlot: 'lunch',
        state: 'eaten',
        sourceType: 'recipe',
        sourceNameSnapshot: 'Soup',
        recipeId: crypto.randomUUID(),
        servingCount: 1,
        provenance,
        values: [
          {
            nutrientCode: 'protein',
            amount: 20,
            sourceIds: ['mutable-preferred-record'],
            confidence: 0.7,
            completeness: 0.4,
            estimated: true,
          },
        ],
      }),
    ).toThrow(/calculation|source IDs/iu);
  });

  it('does not let planned or served allocations imply consumption', () => {
    expect(() =>
      nutritionMealAllocationInputSchema.parse({
        mealPlanEntryId: crypto.randomUUID(),
        state: 'planned',
        servings: 1,
        intakeSeriesId: crypto.randomUUID(),
      }),
    ).toThrow(/only an explicitly eaten allocation/iu);
    expect(
      nutritionMealAllocationInputSchema.parse({
        mealPlanEntryId: crypto.randomUUID(),
        state: 'served',
        servings: 1,
      }),
    ).toMatchObject({ state: 'served', intakeSeriesId: null });
  });
});
