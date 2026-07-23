import { describe, expect, it } from 'vitest';

import {
  confirmPreparedConsumptionSchema,
  createPreparedRecipeSchema,
  nutritionCommandDigest,
} from '@/lib/domain/nutrition-prepared-consumption';

describe('prepared Nutrition commands', () => {
  it('requires a planned meal or completed cook-session link and rejects unknown fields', () => {
    const base = {
      preparedInstanceId: '11111111-1111-4111-8111-111111111111',
      recipeCalculationId: '22222222-2222-4222-8222-222222222222',
      actualServings: 4,
      preparationMatchesCalculation: true,
    };
    expect(createPreparedRecipeSchema.safeParse(base).success).toBe(false);
    expect(
      createPreparedRecipeSchema.safeParse({
        ...base,
        mealPlanEntryId: '33333333-3333-4333-8333-333333333333',
        nutrients: { energy_kcal: 9999 },
      }).success,
    ).toBe(false);
  });

  it('accepts partial portions and creates stable canonical request digests', () => {
    expect(
      confirmPreparedConsumptionSchema.parse({
        idempotencyKey: 'device-command-001',
        servingCount: 0.5,
        occurredAt: '2026-07-19T19:00:00-07:00',
        mealSlot: 'dinner',
      }).servingCount,
    ).toBe(0.5);
    expect(
      confirmPreparedConsumptionSchema.parse({
        idempotencyKey: 'device-command-002',
        portionWeightGrams: 125,
        occurredAt: '2026-07-19T19:00:00-07:00',
        mealSlot: 'dinner',
      }).portionWeightGrams,
    ).toBe(125);
    expect(
      confirmPreparedConsumptionSchema.safeParse({
        idempotencyKey: 'device-command-003',
        servingCount: 1,
        portionWeightGrams: 125,
        occurredAt: '2026-07-19T19:00:00-07:00',
        mealSlot: 'dinner',
      }).success,
    ).toBe(false);
    expect(
      confirmPreparedConsumptionSchema.safeParse({
        idempotencyKey: 'device-command-004',
        occurredAt: '2026-07-19T19:00:00-07:00',
        mealSlot: 'dinner',
      }).success,
    ).toBe(false);
    expect(nutritionCommandDigest({ b: 2, a: 1 })).toBe(nutritionCommandDigest({ a: 1, b: 2 }));
    expect(nutritionCommandDigest({ a: 1 })).not.toBe(nutritionCommandDigest({ a: 2 }));
  });
});
