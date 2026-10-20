import { describe, expect, it } from 'vitest';
import {
  normalizeCatalogMeasure,
  createRequestGeneration,
} from '../../shared/mobile-domain/catalog-measures';
import {
  nutritionSourceContextKey,
  selectNutritionSourcePortion,
  type NutritionSourceRecord,
} from '../../shared/mobile-domain/nutrition-source-portions';

const record: NutritionSourceRecord = {
  id: 'saved-record',
  revision: 2,
  basisType: 'per_100g',
  basisAmount: 100,
  basisUnit: 'g',
  sourceName: 'USDA fixture',
  supportedUnits: ['g', 'kg'],
  catalogRef: {
    transport_id: 'bord_food_api',
    source_id: 'usda_fdc',
    source_record_id: 'food',
    source_revision: 'frozen-v2',
    catalog_generation: 'generation-1',
    canonical_product_id: null,
  },
};
const productId = 'product';
const choose = (
  candidate: NutritionSourceRecord,
  measure = normalizeCatalogMeasure({
    amount: 2,
    measureUnit: { name: 'cup' },
    modifier: 'chopped',
    gramWeight: 240,
  }),
  key = nutritionSourceContextKey(productId, candidate),
  locked = false,
) =>
  selectNutritionSourcePortion({
    productId,
    record: candidate,
    reviewedContextKey: key,
    measure,
    locked,
  });

describe('native saved-food source portions', () => {
  it('copies the complete stated source weight and pins the exact saved nutrition record', () => {
    for (const amount of [0.5, 1, 2]) {
      const measure = normalizeCatalogMeasure({
        amount,
        measureUnit: { name: 'cup' },
        modifier: 'chopped',
        gramWeight: amount * 120,
        form: 'cooked',
        basis: 'prepared',
      });
      expect(measure.label).toBe(`${amount} cup · chopped`);
      expect(choose(record, measure)).toEqual({
        quantity: amount * 120,
        unit: 'g',
        expectedFoodNutritionRecordId: 'saved-record',
      });
      expect(measure.form).toBe('cooked');
      expect(measure.basis).toBe('prepared');
    }
  });
  it('requires server-supported grams; provider weight does not establish density or a serving conversion', () => {
    for (const candidate of [
      { ...record, basisType: 'per_100ml' as const, basisUnit: 'ml', supportedUnits: ['ml', 'l'] },
      {
        ...record,
        basisType: 'per_serving' as const,
        basisAmount: 1,
        basisUnit: 'serving',
        supportedUnits: [],
      },
      {
        ...record,
        basisType: 'per_unit' as const,
        basisAmount: 1,
        basisUnit: 'each',
        supportedUnits: ['each'],
      },
    ])
      expect(choose(candidate)).toBeNull();
    expect(
      choose({
        ...record,
        basisType: 'per_serving',
        basisAmount: 1,
        basisUnit: 'serving',
        supportedUnits: ['g'],
      })?.quantity,
    ).toBe(240);
  });
  it('does not change an entered amount during reads, unavailable context or failed selection', () => {
    const draft = { quantity: '17.25', unit: 'ml' };
    const before = { ...draft };
    for (const gramWeight of [null, 0, -1, Infinity, 10001]) {
      expect(
        choose(record, normalizeCatalogMeasure({ amount: 1, unit: 'cup', gramWeight })),
      ).toBeNull();
    }
    expect(choose({ ...record, catalogRef: null })).toBeNull();
    expect(draft).toEqual(before);
  });
  it('rejects previous product, saved record, source revision and catalog generation contexts', () => {
    const oldKey = nutritionSourceContextKey(productId, record);
    for (const changed of [
      { ...record, id: 'replacement-record' },
      { ...record, revision: 3 },
      { ...record, catalogRef: { ...record.catalogRef!, source_revision: 'new-revision' } },
      { ...record, catalogRef: { ...record.catalogRef!, catalog_generation: 'new-generation' } },
      { ...record, basisAmount: 50 },
    ])
      expect(choose(changed, undefined, oldKey)).toBeNull();
    expect(
      selectNutritionSourcePortion({
        productId: 'another-product',
        record,
        reviewedContextKey: oldKey,
        measure: normalizeCatalogMeasure({ gramWeight: 120 }),
        locked: false,
      }),
    ).toBeNull();
  });
  it('cannot change a pending or unknown submission and makes late request callbacks inert', () => {
    expect(choose(record, undefined, undefined, true)).toBeNull();
    const requests = createRequestGeneration();
    const oldRequest = requests.next();
    const currentRequest = requests.next();
    expect(requests.isCurrent(oldRequest)).toBe(false);
    expect(requests.isCurrent(currentRequest)).toBe(true);
    requests.next();
    expect(requests.isCurrent(currentRequest)).toBe(false);
  });
});
