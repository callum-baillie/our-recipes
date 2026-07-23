import { createHash } from 'node:crypto';
import { z } from 'zod';

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().default(null);
const positive = z.number().finite().positive().max(1_000_000);

export const createPreparedRecipeSchema = z
  .object({
    preparedInstanceId: uuid,
    recipeCalculationId: uuid,
    mealPlanEntryId: nullableUuid,
    cookSessionId: nullableUuid,
    actualServings: positive,
    finalWeightGrams: positive.nullable().default(null),
    preparationMatchesCalculation: z.literal(true),
    note: z.string().trim().max(1_000).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.mealPlanEntryId && !value.cookSessionId) {
      context.addIssue({
        code: 'custom',
        path: ['cookSessionId'],
        message:
          'Prepared serving allocation requires a planned meal or completed cook session. Unplanned recipes can still be logged directly in the Food Diary.',
      });
    }
  });

export const confirmPreparedConsumptionSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(160),
    servingCount: positive.nullable().default(null),
    portionWeightGrams: positive.nullable().default(null),
    occurredAt: z.string().datetime({ offset: true }),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
    allocationSeriesId: uuid.optional(),
    supersedesAllocationVersionId: nullableUuid,
    note: z.string().trim().max(500).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.servingCount === null) === (value.portionWeightGrams === null)) {
      context.addIssue({
        code: 'custom',
        path: ['servingCount'],
        message: 'Provide exactly one serving count or weighed portion.',
      });
    }
  });

export const recordPreparedAllocationSchema = z
  .object({
    allocationSeriesId: uuid,
    supersedesAllocationVersionId: nullableUuid,
    state: z.enum(['served', 'skipped', 'leftover']),
    servingCount: positive,
    note: z.string().trim().max(500).default(''),
  })
  .strict();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function nutritionCommandDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export type CreatePreparedRecipeInput = z.input<typeof createPreparedRecipeSchema>;
export type ConfirmPreparedConsumptionInput = z.input<typeof confirmPreparedConsumptionSchema>;
export type RecordPreparedAllocationInput = z.input<typeof recordPreparedAllocationSchema>;
