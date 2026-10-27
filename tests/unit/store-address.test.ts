import { expect, it } from 'vitest';
import { formatStoreAddress } from '@/lib/domain/store-address';
import { storeProjection } from '@/lib/services/catalog-store-service';

it('preserves a full-address-only official branch and excludes unrelated payload fields', () => {
  const store = storeProjection({
    id: 'sto_synthetic',
    name: 'ALDI synthetic branch',
    content_revision: 'r1',
    source_refs: [],
    address: { full: '1 Example Road, Example City, IA 50000', country: 'US', raw: 'ignored' },
  });
  expect(formatStoreAddress(store.address)).toBe('1 Example Road, Example City, IA 50000');
  expect(store.address).not.toHaveProperty('raw');
});

it('formats both legacy and structured branch addresses without duplicated aliases', () => {
  expect(
    formatStoreAddress({
      postal_code: '50000',
      region: 'IA',
      city: 'Example City',
      house_number: '12',
      street_address: 'Example Road',
      unit: 'Suite 2',
      state: 'IA',
      postcode: '50000',
    }),
  ).toBe('12 Example Road, Suite 2, Example City, IA, 50000');
  expect(formatStoreAddress({})).toBe('');
});
