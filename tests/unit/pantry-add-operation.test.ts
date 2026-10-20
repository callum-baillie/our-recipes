import { describe, it, expect, vi } from 'vitest';
import {
  createPantryAddOperation,
  resumePantryAddOperation,
  pantryAddOperationSchema,
  type PantryAddOperation,
} from '@/lib/client/pantry-add-operation';
describe('manual Pantry addition recovery', () => {
  it('retains product and per-batch acknowledgements and reuses exactly the lost request key', async () => {
    const original = createPantryAddOperation({
      label: 'Lentils',
      productId: '',
      product: { displayName: 'Lentils' },
      batch: { quantityRemaining: 500, unit: 'g', locationId: 'cupboard' },
      batchCount: 3,
    });
    let saved = original;
    const calls: Array<{ path: string; key: string; body: unknown }> = [];
    let firstLost = true;
    const committed = new Map<string, Response>();
    const request = vi.fn<typeof fetch>(async (path, options) => {
      const key = (options?.headers as Record<string, string>)['Idempotency-Key']!;
      calls.push({ path: String(path), key, body: JSON.parse(options!.body as string) });
      if (committed.has(key)) return committed.get(key)!.clone();
      const response = Response.json(
        String(path).endsWith('/products')
          ? { product: { id: 'product' } }
          : { batch: { id: `batch-${committed.size}` } },
      );
      committed.set(key, response.clone());
      if (key === original.batchKeys[1] && firstLost) {
        firstLost = false;
        throw new TypeError('Response lost after commit');
      }
      return response;
    });
    await expect(
      resumePantryAddOperation(
        original,
        (next) => {
          saved = next;
        },
        request,
      ),
    ).rejects.toThrow(/outcome is unknown/);
    expect(saved.productId).toBe('product');
    expect(saved.acknowledged).toEqual(['batch-1']);
    expect(saved.uncertain).toBe(true);
    // A persisted exact request survives navigation; a newer visible draft is not read here.
    saved = pantryAddOperationSchema.parse(JSON.parse(JSON.stringify(saved)));
    const done = await resumePantryAddOperation(
      saved,
      (next) => {
        saved = next;
      },
      request,
    );
    expect(done.acknowledged).toEqual(['batch-1', 'batch-2', 'batch-3']);
    expect(calls.filter((call) => call.path.endsWith('/products'))).toHaveLength(1);
    expect(calls.filter((call) => call.key === original.batchKeys[0])).toHaveLength(1);
    const retry = calls.filter((call) => call.key === original.batchKeys[1]);
    expect(retry).toHaveLength(2);
    expect(retry[0]).toEqual(retry[1]);
    expect(committed.size).toBe(4);
  });
  it('keeps definite validation failure separate from uncertain state and does not replay expired keys', async () => {
    const original = createPantryAddOperation({
      label: 'Rice',
      productId: 'product',
      product: null,
      batch: { quantityRemaining: 1, unit: 'kg' },
      batchCount: 2,
    });
    let saved: PantryAddOperation = original;
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { message: 'Choose a current location.' } }, { status: 400 }),
    );
    await expect(
      resumePantryAddOperation(
        original,
        (next) => {
          saved = next;
        },
        request,
      ),
    ).rejects.toThrow('Choose a current location');
    expect(saved.uncertain).toBe(false);
    expect(saved.acknowledged).toEqual([]);
    request.mockClear();
    await expect(
      resumePantryAddOperation(
        { ...saved, createdAt: Date.now() - 25 * 60 * 60 * 1000 },
        () => {},
        request,
      ),
    ).rejects.toThrow('replay protection may have expired');
    expect(request).not.toHaveBeenCalled();
  });
});
