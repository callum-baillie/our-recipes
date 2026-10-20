import { z } from 'zod';
const object = z.record(z.string(), z.unknown());
export const pantryAddOperationSchema = z.object({
  id: z.uuid(),
  createdAt: z.number(),
  label: z.string(),
  productId: z.string(),
  productKey: z.uuid(),
  product: object.nullable(),
  batch: object,
  batchKeys: z.array(z.uuid()).min(1).max(20),
  acknowledged: z.array(z.string()).max(20),
  uncertain: z.boolean(),
  message: z.string(),
});
export type PantryAddOperation = z.infer<typeof pantryAddOperationSchema>;
export function createPantryAddOperation(input: {
  label: string;
  productId: string;
  product: Record<string, unknown> | null;
  batch: Record<string, unknown>;
  batchCount: number;
}): PantryAddOperation {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    productKey: crypto.randomUUID(),
    batchKeys: Array.from({ length: Math.min(20, Math.max(1, Math.floor(input.batchCount))) }, () =>
      crypto.randomUUID(),
    ),
    acknowledged: [],
    uncertain: false,
    message: '',
  };
}
export async function resumePantryAddOperation(
  original: PantryAddOperation,
  onProgress: (operation: PantryAddOperation) => void,
  request: typeof fetch = fetch,
): Promise<PantryAddOperation> {
  let operation = { ...original };
  if (Date.now() - operation.createdAt >= 24 * 60 * 60 * 1000)
    throw new Error(
      'This request is more than 24 hours old. Review the current Pantry records before making another addition; its replay protection may have expired.',
    );
  async function post(path: string, key: string, payload: unknown, field: 'product' | 'batch') {
    operation = {
      ...operation,
      uncertain: true,
      message: `Checking ${field === 'product' ? 'product creation' : `batch ${operation.acknowledged.length + 1} of ${operation.batchKeys.length}`}…`,
    };
    onProgress(operation);
    let response: Response;
    try {
      response = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error(
        'The current request outcome is unknown. Resume this same addition to check it safely; do not create it again.',
      );
    }
    const body = (await response.json().catch(() => null)) as {
      product?: { id?: string };
      batch?: { id?: string };
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      operation = {
        ...operation,
        uncertain: response.status >= 500,
        message: body?.error?.message ?? 'The current addition could not be confirmed.',
      };
      onProgress(operation);
      throw new Error(operation.message);
    }
    const id = body?.[field]?.id;
    if (!id)
      throw new Error(
        'The response did not identify the saved record. Resume the same request to reconcile its outcome.',
      );
    return id;
  }
  if (!operation.productId) {
    const productId = await post(
      '/api/v1/pantry/products',
      operation.productKey,
      operation.product,
      'product',
    );
    operation = {
      ...operation,
      productId,
      uncertain: false,
      message: 'Product saved. No stock is implied by product creation.',
    };
    onProgress(operation);
  }
  while (operation.acknowledged.length < operation.batchKeys.length) {
    const id = await post(
      '/api/v1/pantry/batches',
      operation.batchKeys[operation.acknowledged.length]!,
      { ...operation.batch, productId: operation.productId },
      'batch',
    );
    operation = {
      ...operation,
      acknowledged: [...operation.acknowledged, id],
      uncertain: false,
      message: `${operation.acknowledged.length + 1} of ${operation.batchKeys.length} batches confirmed.`,
    };
    onProgress(operation);
  }
  return operation;
}
