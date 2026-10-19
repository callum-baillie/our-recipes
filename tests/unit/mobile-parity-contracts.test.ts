import { bodyMetricFields as webBodyFields, bodyMetricsSchema } from '@/lib/domain/body-metrics';
import { bodyMetricFields, parseBodyMetrics } from '../../mobile/src/data/body-metrics';
import { describe, expect, it } from 'vitest';
import { mealPlanEntrySchema, mealPlanEntryUpdateSchema } from '@/lib/domain/planning';
import { NUTRIENT_DEFINITIONS } from '@/lib/domain/nutrition';
import {
  recipePdfExportSchema,
  mealPlanPdfExportSchema,
  inventoryPdfExportSchema,
} from '@/lib/domain/pdf-export';
import { manualConsumptionRequestSchema } from '@/lib/domain/nutrition-food-diary';
import { mealEntryPayload, type MealEntry } from '../../mobile/src/data/meal-entry';
import { nutrientValues, localTimestamp } from '../../mobile/src/data/nutrition-commands';
import { nutrientCatalog } from '../../mobile/src/data/nutrient-catalog';
const recipeId = '49386bc5-777c-4588-a019-a032a03f6a99';
const base = {
  kind: 'recipe' as const,
  date: '2026-10-16',
  meal: 'dinner',
  recipeId,
  title: '',
  servings: '4',
  note: '',
  sourceId: '',
  quantity: '',
  unit: '',
  adaptation: null,
  adapt: false,
};
describe('mobile payloads against web contracts', () => {
  it('accepts recipe and non-recipe planner entries', () => {
    expect(mealPlanEntrySchema.safeParse(mealEntryPayload(base)).success).toBe(true);
    for (const kind of ['item', 'takeout', 'custom'] as const) {
      const payload = mealEntryPayload({ ...base, kind, title: 'Lunch' });
      expect(payload.recipeId).toBe('');
      expect(mealPlanEntrySchema.safeParse(payload).success).toBe(true);
    }
  });
  it('retains concurrency checks on leftover edits', () => {
    const original = { updatedAt: '2026-10-16T12:00:00.000Z' } as MealEntry;
    const payload = mealEntryPayload({ ...base, kind: 'leftover', sourceId: recipeId, original });
    expect(mealPlanEntryUpdateSchema.safeParse(payload).success).toBe(true);
    expect(payload.expectedUpdatedAt).toBe(original.updatedAt);
  });
  it('validates local calendar input before sending a mutation', () => {
    expect(() => mealEntryPayload({ ...base, date: '2026-02-30' })).toThrow();
    expect(() => mealEntryPayload({ ...base, servings: '1.5' })).toThrow();
    expect(() => localTimestamp('2026-10-16', '25:00')).toThrow();
  });
  it('keeps the native nutrient catalog aligned with the server', () => {
    expect(nutrientCatalog).toEqual(
      NUTRIENT_DEFINITIONS.map((item) => ({
        code: item.code,
        name: item.displayName,
        unit: item.canonicalUnit,
      })),
    );
  });
  it('preserves unknown nutrients separately from explicit zero', () => {
    const values = nutrientValues({ energy_kcal: '0', protein: '', fiber: '2.5' });
    expect(values).toEqual([
      { nutrientCode: 'energy_kcal', amount: 0 },
      { nutrientCode: 'fiber', amount: 2.5 },
    ]);
    const result = manualConsumptionRequestSchema.safeParse({
      sourceName: 'Meal',
      quantity: 1,
      unit: 'portion',
      occurredAt: localTimestamp('2026-10-16', '12:30'),
      mealSlot: 'lunch',
      values,
    });
    expect(result.success).toBe(true);
    expect(() => nutrientValues({ protein: '-1' })).toThrow();
  });
  it('accepts the mobile PDF options for each document', () => {
    const options = {
      paper: 'Letter',
      includeNotes: false,
      includeNutrition: true,
      includeImage: true,
    };
    expect(recipePdfExportSchema.safeParse({ ...options, recipeIds: [recipeId] }).success).toBe(
      true,
    );
    expect(
      mealPlanPdfExportSchema.safeParse({ ...options, start: '2026-10-16', end: '2026-10-22' })
        .success,
    ).toBe(true);
    expect(inventoryPdfExportSchema.safeParse(options).success).toBe(true);
  });
});

describe('planned recipe variations', () => {
  it('normalizes decimal input only on save and retains structured sections', () => {
    const payload = mealEntryPayload({
      ...base,
      adapt: true,
      adaptation: {
        title: 'Soup',
        summary: 'Adjusted',
        servings: '4 servings',
        ingredientGroups: [
          {
            name: 'Soup',
            ingredients: [
              {
                item: 'Lentils',
                quantity: '1.5',
                unit: 'cup',
                note: 'rinsed',
                shoppingCategory: 'Other',
              },
            ],
          },
        ],
        instructionSections: [{ title: 'Cook', steps: ['Simmer until tender.'] }],
      },
    });
    expect(payload.recipeOverride?.ingredientGroups[0].ingredients[0].quantity).toBe(1.5);
    expect(mealPlanEntrySchema.safeParse(payload).success).toBe(true);
  });
  it('clears an existing variation explicitly and rejects invalid quantities', () => {
    const original = { recipeOverride: '{}', updatedAt: '2026-10-16T12:00:00.000Z' } as MealEntry;
    expect(mealEntryPayload({ ...base, original }).recipeOverride).toBeNull();
    expect(() =>
      mealEntryPayload({
        ...base,
        adapt: true,
        adaptation: {
          title: 'Soup',
          summary: '',
          servings: '4',
          ingredientGroups: [
            {
              name: '',
              ingredients: [
                {
                  item: 'Salt',
                  quantity: 'not a number',
                  unit: 'g',
                  note: '',
                  shoppingCategory: 'Other',
                },
              ],
            },
          ],
          instructionSections: [{ title: '', steps: ['Cook'] }],
        },
      }),
    ).toThrow();
  });
});

describe('native body composition records', () => {
  it('keeps field metadata aligned with web controls', () => {
    expect(bodyMetricFields).toEqual(webBodyFields);
  });
  it('preserves missing values and validates units and body components', () => {
    const values = parseBodyMetrics(
      { bodyFatPercent: '0', muscleMassKilograms: '40', boneMassKilograms: '' },
      70,
    );
    expect(values).toEqual({ bodyFatPercent: 0, muscleMassKilograms: 40 });
    expect(bodyMetricsSchema.safeParse(values).success).toBe(true);
    expect(() => parseBodyMetrics({ muscleMassKilograms: '80' }, 70)).toThrow();
    expect(() => parseBodyMetrics({ boneMassKilograms: '0' }, 70)).toThrow();
    expect(() => parseBodyMetrics({ bodyFatPercent: '101' }, 70)).toThrow();
  });
});
