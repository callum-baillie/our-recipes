import { describe, expect, it } from 'vitest';

import {
  deleteIntakeRequestSchema,
  manualConsumptionRequestSchema,
  productConsumptionRequestSchema,
} from '@/lib/domain/nutrition-food-diary';

describe('Food Diary HTTP inputs', () => {
  const timing = { occurredAt: '2026-07-19T18:00:00-07:00', mealSlot: 'dinner' as const };

  it('requires an audit reason for corrections and deletions', () => {
    expect(() =>
      productConsumptionRequestSchema.parse({
        ...timing,
        productId: '11111111-1111-4111-8111-111111111111',
        quantity: 50,
        unit: 'g',
        supersedesIntakeRevisionId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow('audit reason');
    expect(() => deleteIntakeRequestSchema.parse({ reason: '' })).toThrow();
  });

  it('keeps manual values explicit and unique without accepting quality claims', () => {
    expect(
      manualConsumptionRequestSchema.parse({
        ...timing,
        sourceName: 'Cafe soup',
        quantity: 1,
        unit: 'bowl',
        values: [{ nutrientCode: 'energy_kcal', amount: 320 }],
      }).values,
    ).toEqual([{ nutrientCode: 'energy_kcal', amount: 320 }]);
    expect(() =>
      manualConsumptionRequestSchema.parse({
        ...timing,
        sourceName: 'Cafe soup',
        quantity: 1,
        unit: 'bowl',
        confidence: 1,
        values: [{ nutrientCode: 'energy_kcal', amount: 320 }],
      }),
    ).toThrow();
    expect(() =>
      manualConsumptionRequestSchema.parse({
        ...timing,
        sourceName: 'Cafe soup',
        quantity: 1,
        unit: 'bowl',
        values: [
          { nutrientCode: 'energy_kcal', amount: 320 },
          { nutrientCode: 'energy_kcal', amount: 321 },
        ],
      }),
    ).toThrow('Duplicate nutrient');
  });
});
