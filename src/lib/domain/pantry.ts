import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const optionalPositive = z.union([z.null(), z.coerce.number().positive().max(1_000_000)]);
const optionalNonNegative = z.union([z.null(), z.coerce.number().min(0).max(1_000_000)]);
const isoDate = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use a YYYY-MM-DD date.')])
  .default('')
  .transform((value) => value || null);

export const pantryStorageTypeSchema = z.enum([
  'pantry',
  'refrigerator',
  'freezer',
  'counter',
  'other',
]);

export const pantryApproximateStateSchema = z.enum([
  'full',
  'three_quarters',
  'half',
  'quarter',
  'almost_empty',
  'unknown',
]);

export const pantryBatchStatusSchema = z.enum([
  'unopened',
  'opened',
  'frozen',
  'thawed',
  'reserved',
  'depleted',
  'discarded',
  'donated',
]);

export const pantryProductInputSchema = z
  .object({
    displayName: requiredText(160),
    brand: boundedText(120).default(''),
    variant: boundedText(120).default(''),
    category: boundedText(80).default(''),
    subcategory: boundedText(80).default(''),
    aliases: z.array(requiredText(120)).max(30).default([]),
    defaultInventoryUnit: requiredText(30).default('each'),
    defaultPackageAmount: optionalPositive.default(null),
    defaultPackageUnit: boundedText(30).default(''),
    defaultStorageType: pantryStorageTypeSchema.default('pantry'),
    dietaryTags: z.array(requiredText(60)).max(30).default([]),
    allergens: z.array(requiredText(60)).max(30).default([]),
    storageInstructions: boundedText(1_000).default(''),
    defaultShelfLifeDays: z
      .union([z.null(), z.coerce.number().int().positive().max(36_500)])
      .default(null),
    shelfLifeAfterOpeningDays: z
      .union([z.null(), z.coerce.number().int().positive().max(36_500)])
      .default(null),
    isStaple: z.boolean().default(false),
    preferredBrand: boundedText(120).default(''),
    preferredStore: boundedText(120).default(''),
    minimumStock: optionalNonNegative.default(null),
    targetStock: optionalNonNegative.default(null),
    reorderThreshold: optionalNonNegative.default(null),
    preferredPurchaseQuantity: optionalPositive.default(null),
    stockUnit: boundedText(30).default(''),
    suggestGroceryRestock: z.boolean().default(false),
    archived: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minimumStock !== null &&
      value.targetStock !== null &&
      value.targetStock < value.minimumStock
    ) {
      context.addIssue({
        code: 'custom',
        path: ['targetStock'],
        message: 'Target stock must be at least the minimum stock.',
      });
    }
  });

export const pantryProductUpdateSchema = pantryProductInputSchema.safeExtend({
  productId: z.string().uuid().optional(),
});

export const pantryLocationInputSchema = z
  .object({
    name: requiredText(100),
    parentId: z.union([z.literal(''), z.string().uuid()]).default(''),
    storageType: pantryStorageTypeSchema,
    description: boundedText(500).default(''),
    position: z.coerce.number().int().min(0).max(10_000).optional(),
    archived: z.boolean().default(false),
  })
  .strict();

export const pantryBatchInputSchema = z
  .object({
    productId: z.string().uuid(),
    quantityRemaining: optionalNonNegative.default(null),
    originalQuantity: optionalPositive.default(null),
    unit: boundedText(30).default(''),
    packageCount: optionalPositive.default(null),
    amountPerPackage: optionalPositive.default(null),
    packageUnit: boundedText(30).default(''),
    approximateState: z.union([z.null(), pantryApproximateStateSchema]).default(null),
    locationId: z.string().uuid(),
    sublocation: boundedText(120).default(''),
    purchaseDate: isoDate,
    bestBeforeDate: isoDate,
    useByDate: isoDate,
    sellByDate: isoDate,
    openedDate: isoDate,
    frozenDate: isoDate,
    thawedDate: isoDate,
    preparedDate: isoDate,
    expiryPrecision: z.enum(['exact', 'estimated', 'month_only', 'unknown']).default('unknown'),
    status: pantryBatchStatusSchema.default('unopened'),
    purchasePriceCents: z
      .union([z.null(), z.coerce.number().int().min(0).max(100_000_000)])
      .default(null),
    source: boundedText(160).default(''),
    notes: boundedText(2_000).default(''),
    excludeFromGrocery: z.boolean().default(false),
    sourceRecipeId: z.union([z.literal(''), z.string().uuid()]).default(''),
    sourceMealPlanEntryId: z.union([z.literal(''), z.string().uuid()]).default(''),
    sourceShoppingListItemId: z.union([z.literal(''), z.string().uuid()]).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.quantityRemaining === null && value.approximateState === null) {
      context.addIssue({
        code: 'custom',
        path: ['quantityRemaining'],
        message: 'Enter an exact quantity or choose an approximate amount.',
      });
    }
    if (value.quantityRemaining !== null && value.approximateState !== null) {
      context.addIssue({
        code: 'custom',
        path: ['approximateState'],
        message: 'Choose either an exact quantity or an approximate amount, not both.',
      });
    }
    if (value.approximateState !== null && value.originalQuantity !== null) {
      context.addIssue({
        code: 'custom',
        path: ['originalQuantity'],
        message: 'An approximate amount cannot include an exact original quantity.',
      });
    }
    if (value.quantityRemaining !== null && !value.unit) {
      context.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Choose a unit for an exact quantity.',
      });
    }
    if (
      value.originalQuantity !== null &&
      value.quantityRemaining !== null &&
      value.originalQuantity < value.quantityRemaining
    ) {
      context.addIssue({
        code: 'custom',
        path: ['originalQuantity'],
        message: 'Original quantity cannot be lower than the amount remaining.',
      });
    }
  });

export const pantryBatchUpdateSchema = pantryBatchInputSchema.safeExtend({
  expectedVersion: z.coerce.number().int().positive(),
});

const actionBase = {
  expectedVersion: z.coerce.number().int().positive(),
  note: boundedText(500).default(''),
};

export const pantryBatchActionSchema = z
  .discriminatedUnion('type', [
    z.object({
      ...actionBase,
      type: z.literal('consume'),
      quantity: z.coerce.number().positive().max(1_000_000),
      unit: requiredText(30),
      reason: boundedText(160).default('Manual consumption'),
    }),
    z.object({ ...actionBase, type: z.literal('consume_one') }),
    z.object({ ...actionBase, type: z.literal('mark_empty') }),
    z.object({ ...actionBase, type: z.literal('open'), openedDate: isoDate.default('') }),
    z.object({ ...actionBase, type: z.literal('move'), locationId: z.string().uuid() }),
    z.object({
      ...actionBase,
      type: z.literal('freeze'),
      frozenDate: isoDate.default(''),
      locationId: z.union([z.literal(''), z.string().uuid()]).default(''),
    }),
    z.object({ ...actionBase, type: z.literal('thaw'), thawedDate: isoDate.default('') }),
    z.object({
      ...actionBase,
      type: z.literal('correct'),
      quantityRemaining: optionalNonNegative,
      unit: requiredText(30),
      approximateState: z.union([z.null(), pantryApproximateStateSchema]).default(null),
      reason: requiredText(160),
    }),
    z.object({ ...actionBase, type: z.literal('discard'), reason: boundedText(160).default('') }),
    z.object({ ...actionBase, type: z.literal('donate'), reason: boundedText(160).default('') }),
    z.object({
      ...actionBase,
      type: z.literal('split'),
      quantity: z.coerce.number().positive().max(1_000_000),
      unit: requiredText(30),
      locationId: z.union([z.literal(''), z.string().uuid()]).default(''),
    }),
    z.object({
      ...actionBase,
      type: z.literal('combine'),
      targetBatchId: z.string().uuid(),
      targetExpectedVersion: z.coerce.number().int().positive(),
    }),
    z.object({
      ...actionBase,
      type: z.literal('restore'),
      quantityRemaining: optionalNonNegative.default(null),
      unit: boundedText(30).default(''),
      approximateState: z.union([z.null(), pantryApproximateStateSchema]).default(null),
    }),
    z.object({ ...actionBase, type: z.literal('undo') }),
  ])
  .superRefine((value, context) => {
    if (
      (value.type === 'correct' || value.type === 'restore') &&
      value.quantityRemaining !== null &&
      value.approximateState !== null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['approximateState'],
        message: 'Choose either an exact quantity or an approximate amount, not both.',
      });
    }
  });

export const pantryQuerySchema = z.object({
  q: boundedText(160).default(''),
  locationId: z.string().uuid().optional(),
  category: boundedText(80).optional(),
  status: pantryBatchStatusSchema.optional(),
  expiry: z.enum(['soon', 'expired', 'unknown']).optional(),
  view: z
    .enum([
      'all',
      'pantry',
      'refrigerator',
      'freezer',
      'low_stock',
      'opened',
      'unopened',
      'frozen',
      'depleted',
      'discarded',
      'donated',
      'recent',
    ])
    .default('all'),
  sort: z.enum(['name', 'expiry', 'quantity', 'added', 'updated', 'location']).default('expiry'),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});

export const pantryEventQuerySchema = z.object({
  batchId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type PantryProductInput = z.output<typeof pantryProductInputSchema>;
export type PantryLocationInput = z.output<typeof pantryLocationInputSchema>;
export type PantryBatchInput = z.output<typeof pantryBatchInputSchema>;
export type PantryBatchUpdate = z.output<typeof pantryBatchUpdateSchema>;
export type PantryBatchAction = z.output<typeof pantryBatchActionSchema>;
export type PantryQuery = z.output<typeof pantryQuerySchema>;

export type PantryExpiryState = {
  state: 'fresh' | 'soon' | 'expired' | 'unknown';
  kind: 'use_by' | 'best_before' | 'sell_by' | 'opened_shelf_life' | 'unknown';
  date: string | null;
  days: number | null;
};

function daysBetween(from: Date, isoDateValue: string): number {
  const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.ceil((Date.parse(`${isoDateValue}T00:00:00Z`) - fromDay) / 86_400_000);
}

export function pantryExpiryState(
  batch: {
    useByDate: string | null;
    bestBeforeDate: string | null;
    sellByDate: string | null;
    openedDate: string | null;
  },
  shelfLifeAfterOpeningDays: number | null,
  now = new Date(),
  soonWindowDays = 7,
): PantryExpiryState {
  const candidates: Array<{ kind: PantryExpiryState['kind']; date: string }> = [];
  if (batch.useByDate) candidates.push({ kind: 'use_by', date: batch.useByDate });
  if (batch.bestBeforeDate) candidates.push({ kind: 'best_before', date: batch.bestBeforeDate });
  if (batch.openedDate && shelfLifeAfterOpeningDays) {
    const opened = new Date(`${batch.openedDate}T00:00:00Z`);
    opened.setUTCDate(opened.getUTCDate() + shelfLifeAfterOpeningDays);
    candidates.push({ kind: 'opened_shelf_life', date: opened.toISOString().slice(0, 10) });
  }
  if (batch.sellByDate) candidates.push({ kind: 'sell_by', date: batch.sellByDate });
  const effective = candidates.sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!effective) return { state: 'unknown', kind: 'unknown', date: null, days: null };
  const { kind, date } = effective;
  const days = daysBetween(now, date);
  return {
    state: days < 0 ? 'expired' : days <= soonWindowDays ? 'soon' : 'fresh',
    kind,
    date,
    days,
  };
}

export function normalizePantryName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
