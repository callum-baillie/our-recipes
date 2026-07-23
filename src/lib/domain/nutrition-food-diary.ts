import { z } from 'zod';

import { NUTRIENT_CODES } from '@/lib/domain/nutrition';

const uuid = z.string().uuid();
const positive = z.number().finite().positive().max(1_000_000);
const correction = {
  supersedesIntakeRevisionId: uuid.nullable().default(null),
  revisionReason: z.string().trim().max(500).default(''),
};
const timing = {
  occurredAt: z.string().datetime({ offset: true }),
  mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
};

export const productConsumptionRequestSchema = z
  .object({
    ...timing,
    ...correction,
    productId: uuid,
    quantity: positive,
    unit: z.string().trim().min(1).max(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.supersedesIntakeRevisionId && !value.revisionReason) {
      context.addIssue({
        code: 'custom',
        path: ['revisionReason'],
        message: 'A product correction requires an audit reason.',
      });
    }
  });

export const manualConsumptionRequestSchema = z
  .object({
    ...timing,
    ...correction,
    sourceName: z.string().trim().min(1).max(300),
    quantity: positive,
    unit: z.string().trim().min(1).max(30),
    values: z
      .array(
        z
          .object({
            nutrientCode: z.enum(NUTRIENT_CODES),
            amount: z.number().finite().min(0).max(1_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(NUTRIENT_CODES.length),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.values.forEach((item, index) => {
      if (seen.has(item.nutrientCode)) {
        context.addIssue({
          code: 'custom',
          path: ['values', index, 'nutrientCode'],
          message: `Duplicate nutrient ${item.nutrientCode}.`,
        });
      }
      seen.add(item.nutrientCode);
    });
    if (value.supersedesIntakeRevisionId && !value.revisionReason) {
      context.addIssue({
        code: 'custom',
        path: ['revisionReason'],
        message: 'A manual correction requires an audit reason.',
      });
    }
  });

export const deleteIntakeRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type ProductConsumptionRequest = z.input<typeof productConsumptionRequestSchema>;
export type ManualConsumptionRequest = z.input<typeof manualConsumptionRequestSchema>;
