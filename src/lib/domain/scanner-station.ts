import { z } from 'zod';
import { scannerCommandSchema } from './scanner';
import { foodCatalogImportInputSchema } from './food-data';
import { pantryBatchActionSchema } from './pantry';

const uuid = z.string().uuid();
export const stationIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u);
export const scannerPreparedSchema = z
  .object({
    productId: uuid,
    defaultsRevision: z.string().regex(/^[a-f0-9]{64}$/u),
    packageAmount: z.number().positive().max(1_000_000),
    packageUnit: z.string().min(1).max(30),
    locationId: uuid.optional(),
  })
  .strict();
export const scannerExtendedCommandSchema = z.union([
  z
    .object({
      type: z.literal('undo_session'),
      targetOperationIds: z
        .array(uuid)
        .min(1)
        .max(50)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  z
    .object({
      type: z.literal('recipe_link'),
      url: z.string().url().max(512),
      scannedAt: z.string().datetime({ offset: true }),
      plannedFor: z.string().date().optional(),
    })
    .strict(),
  scannerCommandSchema,
  z
    .object({
      type: z.literal('pantry_catalog_add'),
      barcode: z.string().regex(/^\d{8,14}$/u),
      packages: z.number().int().min(1).max(99),
      locationId: uuid,
      selection: foodCatalogImportInputSchema.shape.selection,
    })
    .strict(),
  z
    .object({ type: z.literal('batch_action'), batchId: uuid, action: pantryBatchActionSchema })
    .strict(),
  z
    .object({
      type: z.literal('stocktake'),
      counts: z
        .array(
          z
            .object({
              batchId: uuid,
              expectedVersion: z.number().int().positive(),
              quantityRemaining: z.number().min(0).max(1_000_000),
              unit: z.string().min(1).max(30),
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
  z
    .object({
      type: z.literal('shopping_add'),
      listId: uuid,
      productId: uuid,
      quantity: z.number().positive().max(1_000_000),
      unit: z.string().min(1).max(30),
    })
    .strict(),
  z
    .object({
      type: z.literal('shopping_intake'),
      listId: uuid,
      itemId: uuid,
      expectedUpdatedAt: z.string().datetime(),
      productId: uuid,
      locationId: uuid,
      quantity: z.number().positive().max(1_000_000),
      unit: z.string().min(1).max(30),
      complete: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal('leftover'),
      cookSessionId: uuid,
      productId: uuid,
      locationId: uuid,
      quantity: z.number().positive().max(1_000_000),
      unit: z.string().min(1).max(30),
      useByDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/u)
        .optional(),
    })
    .strict(),
]);
export const boundScannerOperationSchema = z
  .object({
    contractVersion: z.literal(2),
    operationId: uuid,
    stationId: stationIdSchema,
    instanceId: uuid,
    bindingId: uuid,
    command: scannerExtendedCommandSchema,
    prepared: scannerPreparedSchema.optional(),
    supersedesOperationId: uuid.optional(),
  })
  .strict();
export type BoundScannerOperation = z.infer<typeof boundScannerOperationSchema>;

export const scannerControlSchema = z.discriminatedUnion('control', [
  z.object({ control: z.literal('meal_date'), plannedFor: z.string().date().nullable() }).strict(),
  z
    .object({
      control: z.literal('mode'),
      mode: z.enum(['idle', 'add', 'remove', 'lookup', 'stocktake']),
    })
    .strict(),
  z.object({ control: z.literal('reset') }).strict(),
  z.object({ control: z.literal('quantity'), packages: z.number().int().min(1).max(99) }).strict(),
  z.object({ control: z.literal('location'), locationId: uuid.nullable() }).strict(),
  z
    .object({
      control: z.literal('action'),
      action: z.enum([
        'open',
        'freeze',
        'thaw',
        'move',
        'mark_empty',
        'discard',
        'donate',
        'expired',
      ]),
    })
    .strict(),
]);
export type ScannerControl = z.infer<typeof scannerControlSchema>;
export const scannerStateSchema = z
  .object({
    bootId: uuid,
    profile: z.enum(['add-only', 'extended']).optional(),
    revision: z.number().int().min(0),
    mode: z.enum(['idle', 'add', 'remove', 'lookup', 'stocktake']),
    packages: z.number().int().min(1).max(99),
    locationId: uuid.nullable(),
    action: z.string().max(30).nullable().default(null),
    plannedFor: z.string().date().nullable().optional(),
    expiresAt: z.number().nonnegative().nullable(),
    readerConnected: z.boolean(),
    queueCount: z.number().int().min(0),
    reviewCount: z.number().int().min(0),
  })
  .strict();
export type ScannerState = z.infer<typeof scannerStateSchema>;
export const scannerEventSchema = z
  .object({
    bootId: uuid.optional(),
    sequence: z.number().int().positive(),
    operationId: uuid.nullable(),
    status: z.enum([
      'info',
      'captured',
      'lookup',
      'queued',
      'sending',
      'uncertain',
      'saved',
      'review',
      'blocked',
    ]),
    message: z.string().max(1000),
    time: z.number().nonnegative(),
    barcode: z.string().max(512).optional(),
    batchId: uuid.optional(),
    command: scannerExtendedCommandSchema.optional(),
    submission: z.enum(['not_submitted', 'attempted']).optional(),
  })
  .strict();
export type ScannerEvent = z.infer<typeof scannerEventSchema>;
export const scannerSyncSchema = z
  .object({
    instanceId: uuid,
    bindingId: uuid,
    state: scannerStateSchema,
    events: z.array(scannerEventSchema).max(50),
    reviewOperationIds: z.array(uuid).max(50).default([]),
    acknowledgements: z
      .array(z.object({ id: uuid, status: z.enum(['applied', 'rejected']) }).strict())
      .max(8),
  })
  .strict();
