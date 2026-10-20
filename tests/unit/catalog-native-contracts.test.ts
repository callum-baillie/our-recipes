import { describe, expect, it } from 'vitest';
import {
  catalogConfirmation,
  catalogQuantity,
  type ReviewedCatalogFood,
} from '../../shared/mobile-domain/catalog';
import {
  foodCatalogImportInputSchema,
  foodCatalogShoppingInputSchema,
} from '@/lib/domain/food-data';
import { authorizeAppRequest } from '@/lib/domain/permissions';
import {
  additionalIntegrationPermissions,
  integrationPermission,
} from '@/lib/domain/integration-routes';
const record: ReviewedCatalogFood = {
  provider: 'usda_fdc',
  providerRecordId: '123',
  displayName: 'Oats',
  canonicalGtin: null,
  brand: '',
  quantity: '',
  servingSize: '',
  nutrientBasis: 'per_100g',
  nutrients: [{ nutrientCode: 'protein', amount: 0, unit: 'g' }],
  allergens: [],
  labels: [],
  citation: 'USDA',
  license: 'Public domain',
  catalogRef: {
    transport_id: 'bord_food_api',
    source_id: 'usda_fdc',
    source_record_id: '123',
    source_revision: 'r1',
    catalog_generation: 'g1',
    canonical_product_id: null,
  },
};
describe('native catalog contract and effects', () => {
  it('retains exact source identity and review while serializing only supported import fields', () => {
    const payload = catalogConfirmation(record, '49386bc5-777c-4588-a019-a032a03f6a99', 'g');
    expect(foodCatalogImportInputSchema.parse(payload).selection.catalogRef).toEqual(
      record.catalogRef,
    );
    expect(
      foodCatalogShoppingInputSchema.safeParse({ ...payload, cartQuantity: 2, cartUnit: 'pack' })
        .success,
    ).toBe(true);
    expect('nutrients' in payload).toBe(false);
    expect(() =>
      catalogConfirmation({ ...record, providerRecordId: '456' }, payload.operationId, 'g'),
    ).toThrow();
  });
  it('does not infer package quantities, scale missing nutrients or allow invalid counts', () => {
    expect(catalogQuantity('2.5', 'g')).toEqual({ quantity: 2.5, unit: 'g' });
    for (const value of ['', '0', '-1', 'Infinity', '10001'])
      expect(() => catalogQuantity(value, 'g')).toThrow();
  });
  it('allows child read operations by effect while denying reviewed household writes', () => {
    for (const path of [
      '/food-data/searches',
      '/food-data/details',
      '/food-data/catalog/measures',
      '/food-data/catalog/storage-guidance',
      '/food-data/catalog/enrichment',
    ]) {
      expect(integrationPermission(`/api/v1${path}`, 'POST')?.action).toBe('read');
      expect(
        authorizeAppRequest({
          role: 'child',
          profileId: 'profile-a',
          pathname: `/api/v1${path}`,
          method: 'POST',
        }).allowed,
      ).toBe(true);
    }
    expect(
      authorizeAppRequest({
        role: 'child',
        profileId: 'profile-a',
        pathname: '/api/v1/shopping-lists/list/catalog-items',
        method: 'POST',
      }).allowed,
    ).toBe(false);
    expect(
      additionalIntegrationPermissions('/api/v1/shopping-lists/list/catalog-items', 'POST'),
    ).toContainEqual({ resource: 'pantry', action: 'create' });
  });
});
