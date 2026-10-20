import { describe, expect, it } from 'vitest';
import { catalogConfirmation, catalogQuantity, type ReviewedCatalogFood } from '@/data/catalog';
describe('reviewed scanner commands', () => {
  it('keeps structured source revision and never sends a name-only scanned identity', () => {
    const record = {
      provider: 'open_food_facts',
      providerRecordId: '4006381333931',
      displayName: 'Oats',
      brand: '',
      quantity: '',
      servingSize: '',
      nutrientBasis: null,
      nutrients: [],
      citation: 'Source fixture',
      license: 'Fixture',
      canonicalGtin: '04006381333931',
      allergens: [],
      labels: [],
      catalogRef: {
        transport_id: 'bord_food_api',
        source_id: 'open_food_facts',
        source_record_id: '4006381333931',
        source_revision: 'reviewed-r1',
        catalog_generation: 'g1',
        canonical_product_id: 'prd_oats',
      },
    } as ReviewedCatalogFood;
    const command = catalogConfirmation(record, 'operation-id', 'each');
    expect(command.selection.catalogRef).toEqual(record.catalogRef);
    expect(command.selection.expectedCanonicalGtin).toBe(record.canonicalGtin);
    expect(catalogQuantity('2', 'each')).toEqual({ quantity: 2, unit: 'each' });
    expect(() => catalogQuantity('0', 'each')).toThrow();
  });
});
