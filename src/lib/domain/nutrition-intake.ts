import { z } from 'zod';

import { NUTRIENT_CODES } from '@/lib/domain/nutrition';

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().default(null);
const probability = z.number().finite().min(0).max(1);
const positive = z.number().finite().positive().max(1_000_000);
const shortText = z.string().trim().max(500);
const sourceId = z.string().trim().min(1).max(200);

export const nutritionIntakeProvenanceSchema = z
  .object({
    sourceIds: z.array(sourceId).min(1).max(50),
    sourceDetails: z
      .array(
        z
          .object({
            id: sourceId,
            name: z.string().trim().min(1).max(200),
            provider: z.string().trim().max(160).default(''),
            version: z.string().trim().max(120).default(''),
            sourceRecordKey: z.string().trim().max(300).default(''),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    calculationVersionId: z.string().trim().min(1).max(200).nullable().default(null),
    sourceDigest: z.string().trim().min(1).max(300),
    basisType: z.enum([
      'recipe_serving',
      'recipe_weight',
      'per_100g',
      'per_100ml',
      'food_serving',
      'food_unit',
      'manual_portion',
    ]),
    basisAmount: positive,
    basisUnit: z.string().trim().min(1).max(30),
    confidence: probability,
    completeness: probability,
    estimated: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set(value.sourceIds);
    if (ids.size !== value.sourceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sourceIds'],
        message: 'Source IDs must be unique.',
      });
    }
    const detailIds = value.sourceDetails.map((detail) => detail.id);
    if (new Set(detailIds).size !== detailIds.length || detailIds.some((id) => !ids.has(id))) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDetails'],
        message: 'Source details must uniquely snapshot every referenced source.',
      });
    }
    if (detailIds.length !== ids.size) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDetails'],
        message: 'Every source ID requires a frozen source detail snapshot.',
      });
    }
  });

export const nutritionIntakeNutrientValueSchema = z
  .object({
    nutrientCode: z.enum(NUTRIENT_CODES),
    amount: z.number().finite().min(0).max(1_000_000_000),
    sourceIds: z.array(sourceId).min(1).max(50),
    confidence: probability,
    completeness: probability,
    estimated: z.boolean(),
  })
  .strict();

export const nutritionIntakeRevisionInputSchema = z
  .object({
    seriesId: uuid.optional(),
    supersedesIntakeRevisionId: nullableUuid,
    occurredAt: z.string().datetime({ offset: true }),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
    state: z.enum(['eaten', 'skipped', 'corrected', 'deleted']),
    sourceType: z.enum(['recipe', 'product', 'manual']),
    sourceNameSnapshot: z.string().trim().max(300).default(''),
    recipeId: nullableUuid,
    productId: nullableUuid,
    recipeCalculationId: nullableUuid,
    foodNutritionRecordId: nullableUuid,
    quantity: positive.nullable().default(null),
    unit: z.string().trim().max(30).nullable().default(null),
    servingCount: positive.nullable().default(null),
    portionWeightGrams: positive.nullable().default(null),
    provenance: nutritionIntakeProvenanceSchema.nullable().default(null),
    revisionReason: shortText.default(''),
    values: z.array(nutritionIntakeNutrientValueSchema).max(NUTRIENT_CODES.length).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const consumed = value.state === 'eaten' || value.state === 'corrected';
    if (consumed) {
      if (!value.sourceNameSnapshot) {
        context.addIssue({
          code: 'custom',
          path: ['sourceNameSnapshot'],
          message: 'Consumed entries require a frozen display name.',
        });
      }
      if (!value.provenance) {
        context.addIssue({
          code: 'custom',
          path: ['provenance'],
          message: 'Consumed entries require an immutable provenance snapshot.',
        });
      }
      if (value.values.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['values'],
          message: 'Consumed entries require at least one snapshotted nutrient.',
        });
      }
    } else if (value.provenance !== null || value.values.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'Skipped and deleted revisions cannot carry consumed nutrient totals.',
      });
    }

    if ((value.quantity === null) !== (value.unit === null)) {
      context.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Quantity and unit must be supplied together.',
      });
    }
    if (
      consumed &&
      value.quantity === null &&
      value.servingCount === null &&
      value.portionWeightGrams === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Consumed entries require an explicit portion basis.',
      });
    }
    if (value.state === 'corrected' || value.state === 'deleted') {
      if (!value.revisionReason) {
        context.addIssue({
          code: 'custom',
          path: ['revisionReason'],
          message: 'Corrections and deletions require an audit reason.',
        });
      }
    }

    const referenceTuple = [
      value.recipeId,
      value.productId,
      value.recipeCalculationId,
      value.foodNutritionRecordId,
    ];
    if (consumed && value.sourceType === 'recipe') {
      if (
        !value.recipeId ||
        !value.recipeCalculationId ||
        value.productId ||
        value.foodNutritionRecordId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['recipeId'],
          message: 'Recipe intake requires exactly a recipe and its calculation snapshot.',
        });
      }
      if (!value.provenance?.calculationVersionId) {
        context.addIssue({
          code: 'custom',
          path: ['provenance', 'calculationVersionId'],
          message: 'Recipe intake must freeze its calculation version.',
        });
      }
    }
    if (consumed && value.sourceType === 'product') {
      if (
        !value.productId ||
        !value.foodNutritionRecordId ||
        value.recipeId ||
        value.recipeCalculationId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['productId'],
          message: 'Product intake requires exactly a product and its food record snapshot.',
        });
      }
    }
    if (consumed && value.sourceType === 'manual' && referenceTuple.some(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['sourceType'],
        message: 'Manual intake cannot claim recipe or product record identity.',
      });
    }
    if (!consumed && referenceTuple.some(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['sourceType'],
        message: 'Skipped and deleted revisions cannot retain active source record links.',
      });
    }

    const seen = new Set<string>();
    for (const [index, nutrient] of value.values.entries()) {
      if (seen.has(nutrient.nutrientCode)) {
        context.addIssue({
          code: 'custom',
          path: ['values', index, 'nutrientCode'],
          message: `Duplicate nutrient ${nutrient.nutrientCode}.`,
        });
      }
      seen.add(nutrient.nutrientCode);
      if (
        value.provenance &&
        nutrient.sourceIds.some((id) => !value.provenance!.sourceIds.includes(id))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['values', index, 'sourceIds'],
          message: 'Nutrient source IDs must be present in the revision provenance snapshot.',
        });
      }
    }
  });

export const nutritionMealAllocationInputSchema = z
  .object({
    seriesId: uuid.optional(),
    supersedesAllocationVersionId: nullableUuid,
    mealPlanEntryId: nullableUuid,
    cookSessionId: nullableUuid,
    state: z.enum(['planned', 'served', 'eaten', 'skipped', 'leftover']),
    servings: positive.nullable().default(null),
    portionWeightGrams: positive.nullable().default(null),
    intakeSeriesId: nullableUuid,
    note: shortText.default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.mealPlanEntryId && !value.cookSessionId) {
      context.addIssue({
        code: 'custom',
        path: ['mealPlanEntryId'],
        message: 'An allocation must identify a planned meal or cook session.',
      });
    }
    if (value.servings === null && value.portionWeightGrams === null) {
      context.addIssue({
        code: 'custom',
        path: ['servings'],
        message: 'An allocation requires servings or portion weight.',
      });
    }
    if ((value.state === 'eaten') !== (value.intakeSeriesId !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['intakeSeriesId'],
        message: 'Only an explicitly eaten allocation may link an intake series.',
      });
    }
  });

export type NutritionIntakeRevisionInput = z.input<typeof nutritionIntakeRevisionInputSchema>;
export type NutritionMealAllocationInput = z.input<typeof nutritionMealAllocationInputSchema>;
