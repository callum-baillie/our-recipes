import { z } from 'zod';

import { isoDateSchema } from '@/lib/domain/planning';

export const pantryShortageGenerationSchema = z
  .object({
    weekStart: isoDateSchema,
    weekEnd: isoDateSchema,
    listId: z.string().uuid().optional(),
    mode: z.enum(['missing', 'all']).default('missing'),
  })
  .refine((value) => value.weekStart <= value.weekEnd, {
    path: ['weekEnd'],
    message: 'The end date must be on or after the start date.',
  });

export const pantryPurchaseIntakeSchema = z
  .object({
    operationKey: z.string().trim().min(8).max(160),
    productId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(30),
    intakeMode: z.enum(['partial', 'complete']).default('partial'),
    packageCount: z.coerce.number().positive().max(1_000_000).optional(),
    amountPerPackage: z.coerce.number().positive().max(1_000_000).optional(),
    packageUnit: z.string().trim().max(30).default(''),
    sublocation: z.string().trim().max(120).default(''),
    purchaseDate: isoDateSchema.optional(),
    bestBeforeDate: isoDateSchema.optional(),
    useByDate: isoDateSchema.optional(),
    sellByDate: isoDateSchema.optional(),
    openedDate: isoDateSchema.optional(),
    frozenDate: isoDateSchema.optional(),
    thawedDate: isoDateSchema.optional(),
    preparedDate: isoDateSchema.optional(),
    expiryPrecision: z.enum(['exact', 'estimated', 'month_only', 'unknown']).default('unknown'),
    purchasePriceCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
    store: z.string().trim().max(120).default(''),
    source: z.string().trim().max(160).default('shopping-list-purchase'),
    notes: z.string().trim().max(2_000).default(''),
  })
  .strict();

export const pantryShoppingControlSchema = z
  .object({
    action: z.enum(['covered', 'ignore', 'inaccurate', 'reset', 'extra']),
    quantity: z.coerce.number().min(0).max(1_000_000).optional(),
    unit: z.string().trim().max(30).default(''),
    note: z.string().trim().max(500).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'extra' && (!(value.quantity && value.quantity > 0) || !value.unit)) {
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Manual extra needs a positive quantity and unit.',
      });
    }
  });

export const pantryCookConsumptionSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(30),
  })
  .strict();

export const pantryCookLeftoverSchema = z
  .object({
    productId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(30),
    useByDate: isoDateSchema.optional(),
    notes: z.string().trim().max(500).default(''),
  })
  .strict();

export const pantryCookConfirmationSchema = z
  .object({
    confirmed: z.literal(true),
    consumptions: z.array(pantryCookConsumptionSchema).max(500),
    leftovers: z.array(pantryCookLeftoverSchema).max(50).default([]),
  })
  .strict();

export const cookSessionPantryStartSchema = z
  .object({
    mealPlanEntryId: z.union([z.literal(''), z.string().uuid()]).optional(),
  })
  .passthrough();

export type PantryShortageGenerationInput = z.input<typeof pantryShortageGenerationSchema>;
export type PantryPurchaseIntakeInput = z.input<typeof pantryPurchaseIntakeSchema>;
export type PantryShoppingControlInput = z.input<typeof pantryShoppingControlSchema>;
export type PantryCookConfirmationInput = z.output<typeof pantryCookConfirmationSchema>;
