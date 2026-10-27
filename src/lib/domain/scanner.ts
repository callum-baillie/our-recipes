import { z } from 'zod';

const uuid = z.string().uuid();
export const scannerCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('recipe'),
      recipeId: uuid,
      expectedRevision: z.number().int().positive(),
      servings: z.number().positive().max(100),
      mealPlanEntryId: uuid.optional(),
    })
    .strict(),
  z
    .object({
      type: z.enum(['pantry_add', 'pantry_remove']),
      barcode: z.string().regex(/^\d{8,14}$/u),
      packages: z.number().int().positive().max(100),
      locationId: uuid.optional(),
    })
    .strict(),
  z.object({ type: z.literal('undo'), targetOperationId: uuid }).strict(),
]);

export const scannerOperationSchema = z
  .object({
    operationId: uuid,
    stationId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
    command: scannerCommandSchema,
  })
  .strict();

export type ScannerOperationInput = z.infer<typeof scannerOperationSchema>;
export type ScannerResult = {
  operationId: string;
  type: string;
  message: string;
  cookSessionId?: string;
  batchId?: string;
  batchVersion?: number;
  inventoryEventIds?: string[];
  targetOperationId?: string;
  contractVersion?: 2;
  stationId?: string;
  bindingId?: string;
  instanceId?: string;
  outcome?: 'succeeded' | 'needs_review';
  recordedAt?: string;
  undoable?: boolean;
  productName?: string;
  quantity?: number;
  unit?: string;
  error?: { code: string; message: string };
  batchChanges?: Array<{ batchId: string; version: number }>;
  shoppingItemId?: string;
};

export class ScannerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}
