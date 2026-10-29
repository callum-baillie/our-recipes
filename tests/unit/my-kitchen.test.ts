import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { createElement } from 'react';
import { ToastProvider } from '@/components/toast-provider';
import { renderToStaticMarkup } from 'react-dom/server';
import { MyKitchen } from '@/components/my-kitchen';
import { equipmentTemplate } from '@/lib/domain/kitchen-catalog';
import {
  comparableMeasurement,
  equipmentInputSchema,
  equipmentDraftSchema,
  measurementSchema,
  type KitchenState,
} from '@/lib/domain/kitchen';
it('K25 renders malicious equipment names as data without executable markup', () => {
  const item = {
    ...equipmentInputSchema.parse({ typeKey: 'custom', name: '<script>alert("private")</script>' }),
    capabilities: [],
    id: 'test-equipment',
    revision: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    actorProfileId: 'actor',
  };
  const state: KitchenState = {
    id: 'kitchen',
    householdId: 'household',
    viewerProfileId: 'actor',
    name: 'My Kitchen',
    coverage: 'partial',
    revision: 1,
    canManage: false,
    items: [item],
  };
  const html = renderWithToasts(
    createElement(MyKitchen, { initial: state, actorKey: 'account:actor', sharing: false }),
  );
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('Equipment sharing is off');
});
it('K26 keeps espresso, filter, moka, grinding and milk functions distinct', () => {
  expect(equipmentTemplate('espresso')!.capabilities).toEqual(['brew-espresso']);
  expect(equipmentTemplate('automatic-espresso')!.capabilities).not.toContain('grind');
  expect(equipmentTemplate('moka-pot')!.capabilities).not.toContain('brew-espresso');
  expect(equipmentTemplate('filter-coffee')!.capabilities).not.toContain('brew-espresso');
  expect(equipmentTemplate('milk-frother')!.capabilities).toEqual(['froth-milk']);
});
it('K02 compares the same measurement basis and preserves device-cup uncertainty', () => {
  const us = comparableMeasurement(
    measurementSchema.parse({ value: 1, unit: 'us-qt', basis: 'nominal-volume' }),
  );
  const imperial = comparableMeasurement(
    measurementSchema.parse({ value: 1, unit: 'imperial-qt', basis: 'nominal-volume' }),
  );
  expect(us.value).toBeCloseTo(946.352946);
  expect(imperial.value).toBeCloseTo(1136.5225);
  expect(
    measurementSchema.safeParse({ value: 3, unit: 'device-cups', basis: 'dry-input' }).success,
  ).toBe(false);
  expect(
    comparableMeasurement(
      measurementSchema.parse({
        value: 3,
        unit: 'device-cups',
        basis: 'dry-input',
        deviceCupMl: 180,
      }),
    ),
  ).toMatchObject({ value: 540, dimension: 'volume', basis: 'dry-input' });
});
it('K02 rejects fractional toaster slots and contradictory capacity values for one mode/compartment', () => {
  expect(
    measurementSchema.safeParse({ value: 1.5, unit: 'slices', basis: 'slices-per-cycle' }).success,
  ).toBe(false);
  expect(
    equipmentInputSchema.safeParse({
      typeKey: 'saucepan',
      name: 'Pan',
      measurements: [
        { value: 3, unit: 'l', basis: 'working-liquid' },
        { value: 2, unit: 'l', basis: 'working-liquid' },
      ],
    }).success,
  ).toBe(false);
  expect(
    equipmentInputSchema.safeParse({
      typeKey: 'air-fryer',
      name: 'Dual baskets',
      independentZones: 2,
      independentZonesConfirmed: true,
      measurements: [
        { value: 1, unit: 'kg', basis: 'food-mass', resourceIndex: 1 },
        { value: 0.5, unit: 'kg', basis: 'food-mass', resourceIndex: 2 },
      ],
    }).success,
  ).toBe(true);
});

it('retains incomplete local measurement drafts without allowing them to be saved', () => {
  const draft = {
    ...equipmentInputSchema.parse({ typeKey: 'saucepan', name: 'Pot' }),
    name: '',
    measurements: [{ value: 0, basis: 'dry-input', unit: 'device-cups' }],
  };
  expect(equipmentDraftSchema.parse(draft).measurements[0]!.value).toBe(0);
  expect(equipmentInputSchema.safeParse(draft).success).toBe(false);
});

function renderWithToasts(ui: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(createElement(ToastProvider, null, ui));
}
