import { shoppingAmountSummary } from '../../shared/mobile-domain/shopping-amounts';
import { describe, expect, it } from 'vitest';
import {
  normalizeCatalogMeasure,
  sourcePortionAmount,
  createRequestGeneration,
  catalogContextKey,
} from '../../shared/mobile-domain/catalog-measures';
import { barcodeReviewChoices } from '../../shared/mobile-domain/catalog';
import {
  scannerRecovery,
  sameScannerActor,
  type ScannerOperation,
  type RecoveryStorage,
} from '../../shared/mobile-domain/scanner-recovery';

describe('raw source portion meaning', () => {
  it.each([0.5, 1, 2])(
    'preserves the full %s cup chopped portion and its own gram weight',
    (amount) => {
      const portion = normalizeCatalogMeasure({
        amount,
        measureUnit: { name: 'cup' },
        modifier: 'chopped',
        portionDescription: 'Edible prepared food',
        gramWeight: 120 * amount,
        form: 'prepared',
        basis: 'as sold',
      });
      expect(portion.label).toBe(`${amount} cup · chopped`);
      expect(portion).toMatchObject({
        amount,
        unit: 'cup',
        modifier: 'chopped',
        description: 'Edible prepared food',
        form: 'prepared',
        basis: 'as sold',
      });
      expect(sourcePortionAmount(portion)).toEqual({ quantity: 120 * amount, unit: 'g' });
    },
  );
  it('keeps missing weight/unit and zero distinct without inferring a conversion', () => {
    expect(normalizeCatalogMeasure({ modifier: 'slice' })).toMatchObject({
      amount: null,
      unit: null,
      gramWeight: null,
      label: 'slice',
    });
    expect(sourcePortionAmount(normalizeCatalogMeasure({ amount: 2, unit: 'piece' }))).toBeNull();
    expect(normalizeCatalogMeasure({ amount: 0, gramWeight: 0 })).toMatchObject({
      amount: 0,
      gramWeight: 0,
    });
    expect(sourcePortionAmount(normalizeCatalogMeasure({ gramWeight: 0 }))).toBeNull();
  });
  it('invalidates both late success and late error/finally after reset or another exact revision/query', () => {
    const requests = createRequestGeneration();
    const a = requests.next();
    requests.next();
    const b = requests.next();
    expect(requests.isCurrent(a)).toBe(false);
    expect(requests.isCurrent(b)).toBe(true);
    const ref = {
      source_id: 'usda_fdc',
      source_record_id: '123',
      source_revision: 'one',
      catalog_generation: 'g1',
    };
    expect(catalogContextKey(ref, 'A')).not.toBe(
      catalogContextKey({ ...ref, source_revision: 'two' }, 'A'),
    );
    expect(catalogContextKey(ref, 'A')).not.toBe(catalogContextKey(ref, 'B'));
  });
  it('retains a local-only barcode match without requiring a remote preferred record', () => {
    const localProduct = { id: 'saved', displayName: 'Oats', brand: '', defaultInventoryUnit: 'g' };
    expect(barcodeReviewChoices({ localProduct, preferred: null, alternatives: [] })).toEqual({
      localProduct,
      records: [],
    });
  });
});

const operation: ScannerOperation = {
  version: 1,
  operationId: 'original-operation',
  actor: { userId: 'account', profileId: 'person' },
  instanceUrl: 'https://kitchen.example',
  createdAt: '2026-10-20T00:00:00Z',
  path: '/api/v1/pantry/batches',
  body: { productId: 'saved', quantityRemaining: 120, unit: 'g' },
  description: '120 g Oats',
  destination: 'pantry',
};
function memoryStorage() {
  const values = new Map<string, string>();
  const storage: RecoveryStorage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return { storage, values };
}
describe('native write-ahead recovery', () => {
  it('survives a new journal instance and preserves exact ID/payload; another account/actor cannot replay', async () => {
    const { storage } = memoryStorage();
    await scannerRecovery(storage, 'scope', operation.instanceUrl, 'account').write(operation);
    const restored = await scannerRecovery(
      storage,
      'scope',
      operation.instanceUrl,
      'account',
    ).read();
    expect(restored).toEqual(operation);
    expect(sameScannerActor(restored!, operation.instanceUrl, operation.actor)).toBe(true);
    expect(
      sameScannerActor(restored!, operation.instanceUrl, {
        ...operation.actor,
        profileId: 'other',
      }),
    ).toBe(false);
    await expect(
      scannerRecovery(storage, 'scope', operation.instanceUrl, 'other').read(),
    ).rejects.toThrow('account');
    await expect(
      scannerRecovery(storage, 'scope', 'https://other.example', 'account').read(),
    ).rejects.toThrow('account');
  });
  it('cannot replace uncertain work and removes it only for its acknowledged operation', async () => {
    const { storage } = memoryStorage();
    const journal = scannerRecovery(storage, 'scope', operation.instanceUrl, 'account');
    await journal.write(operation);
    await expect(journal.write({ ...operation, operationId: 'new' })).rejects.toThrow('previous');
    await journal.acknowledge('different');
    expect(await journal.read()).toEqual(operation);
    await journal.acknowledge(operation.operationId);
    expect(await journal.read()).toBeNull();
  });
  it('does not commit an incomplete local write and fails closed for a torn committed record', async () => {
    const { storage, values } = memoryStorage();
    const failing = {
      ...storage,
      async setItem(key: string, value: string) {
        if (key === 'scope') throw new Error('storage unavailable');
        await storage.setItem(key, value);
      },
    };
    await expect(
      scannerRecovery(failing, 'scope', operation.instanceUrl, 'account').write(operation),
    ).rejects.toThrow('storage unavailable');
    expect(
      await scannerRecovery(storage, 'scope', operation.instanceUrl, 'account').read(),
    ).toBeNull();
    await scannerRecovery(storage, 'scope', operation.instanceUrl, 'account').write(operation);
    values.delete('scope.0');
    await expect(
      scannerRecovery(storage, 'scope', operation.instanceUrl, 'account').read(),
    ).rejects.toThrow('incomplete');
  });
});

describe('native purchase quantity dimensions', () => {
  it('keeps 500 g cart purchase separate from 2 each demand through intake defaults', () => {
    expect(
      shoppingAmountSummary({ quantity: 2, unit: 'each', cartQuantity: 500, cartUnit: 'g' }),
    ).toEqual({ requested: '2 each', cart: '500 g', purchaseQuantity: '500', purchaseUnit: 'g' });
  });
  it('preserves zero, unknown and a missing legacy cart unit without substituting demand', () => {
    expect(
      shoppingAmountSummary({ quantity: 2, unit: 'each', cartQuantity: 0, cartUnit: null }),
    ).toEqual({
      requested: '2 each',
      cart: '0 (unit not recorded)',
      purchaseQuantity: '0',
      purchaseUnit: '',
    });
    expect(shoppingAmountSummary({ quantity: null, unit: 'g' })).toMatchObject({
      requested: 'Amount not recorded (g)',
      purchaseQuantity: '',
      purchaseUnit: '',
    });
  });
});
