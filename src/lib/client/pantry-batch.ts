import { createClientUuid } from './client-uuid';

export type SavedBatch = { id: string; version: number; status: string };

/** JSON request that surfaces the server's message when it refuses. */
export async function pantryRequest<T = { batch?: SavedBatch }>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
  idempotent = false,
): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotent ? { 'Idempotency-Key': createClientUuid() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as
    (T & { error?: { message?: string } }) | null;
  if (!response.ok)
    throw new Error(result?.error?.message ?? 'That Pantry change could not be saved.');
  return result as T;
}

type BatchTarget = { id: string; version: number };

export function batchAction(batch: BatchTarget, body: Record<string, unknown>) {
  return pantryRequest(`/api/v1/pantry/batches/${batch.id}/actions`, 'POST', {
    ...body,
    expectedVersion: batch.version,
    note: '',
  });
}

/** Set the amount on hand. Zero marks the batch empty, which keeps it undoable. */
export function setBatchQuantity(batch: BatchTarget & { unit: string }, quantity: number) {
  return quantity <= 0
    ? batchAction(batch, { type: 'mark_empty' })
    : batchAction(batch, {
        type: 'correct',
        quantityRemaining: quantity,
        unit: batch.unit,
        approximateState: null,
        reason: 'Adjusted by hand',
      });
}

/** Counted by the expiry metrics: the reason is the one the Pantry totals look for. */
export function expireBatch(batch: BatchTarget) {
  return batchAction(batch, { type: 'discard', reason: 'Expired' });
}

export function removeBatch(batch: BatchTarget) {
  return batchAction(batch, { type: 'discard', reason: 'Removed from Pantry' });
}

export function undoBatch(batch: BatchTarget) {
  return batchAction(batch, { type: 'undo' });
}

export function moveBatch(batch: BatchTarget, locationId: string) {
  return batchAction(batch, { type: 'move', locationId });
}

const DATES = [
  'purchaseDate',
  'bestBeforeDate',
  'useByDate',
  'sellByDate',
  'openedDate',
  'frozenDate',
  'thawedDate',
  'preparedDate',
] as const;

/** Rewrite a batch's best-before date; every other field is carried over unchanged. */
export async function setBatchBestBefore(batchId: string, date: string) {
  const { batch } = await pantryRequest<{ batch: Record<string, unknown> }>(
    `/api/v1/pantry/batches/${batchId}`,
    'GET',
  );
  const payload: Record<string, unknown> = {
    productId: batch.productId,
    quantityRemaining: batch.quantityRemaining,
    originalQuantity: batch.originalQuantity,
    unit: batch.unit,
    packageCount: batch.packageCount,
    amountPerPackage: batch.amountPerPackage,
    packageUnit: batch.packageUnit,
    approximateState: batch.quantityRemaining === null ? batch.approximateState : null,
    locationId: batch.locationId,
    sublocation: batch.sublocation,
    expiryPrecision: date ? 'exact' : batch.expiryPrecision,
    status: batch.status,
    purchasePriceCents: batch.purchasePriceCents,
    source: batch.source,
    notes: batch.notes,
    excludeFromGrocery: batch.excludeFromGrocery,
    sourceRecipeId: batch.sourceRecipeId ?? '',
    sourceMealPlanEntryId: batch.sourceMealPlanEntryId ?? '',
    sourceShoppingListItemId: batch.sourceShoppingListItemId ?? '',
    expectedVersion: batch.version,
  };
  for (const field of DATES) payload[field] = (batch[field] as string | null) ?? '';
  payload.bestBeforeDate = date;
  return pantryRequest(`/api/v1/pantry/batches/${batchId}`, 'PATCH', payload);
}

/** The few batch facts the scan lists show and edit. */
export type BatchInfo = {
  id: string;
  version: number;
  quantity: number | null;
  unit: string;
  locationId: string;
  location: string;
  bestBefore: string | null;
};

type BatchRow = {
  id: string;
  version: number;
  quantityRemaining: number | null;
  unit: string;
  locationId: string;
  bestBeforeDate?: string | null;
  location?: { path?: string };
};

export const batchInfo = (batch: BatchRow): BatchInfo => ({
  id: batch.id,
  version: batch.version,
  quantity: batch.quantityRemaining,
  unit: batch.unit,
  locationId: batch.locationId,
  location: batch.location?.path ?? '',
  bestBefore: batch.bestBeforeDate ?? null,
});

export async function fetchBatchInfo(batchId: string): Promise<BatchInfo> {
  const { batch } = await pantryRequest<{ batch: BatchRow }>(
    `/api/v1/pantry/batches/${batchId}`,
    'GET',
  );
  return batchInfo(batch);
}
