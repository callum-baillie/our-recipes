import { describe, expect, it } from 'vitest';

import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
  inventoryUnitDimension,
  normalizeInventoryUnit,
} from '@/lib/domain/inventory-units';
import {
  pantryBatchActionSchema,
  pantryBatchInputSchema,
  pantryExpiryState,
} from '@/lib/domain/pantry';

describe('Pantry measurement validation', () => {
  it('normalizes every omitted ISO date to null while preserving a supplied best-before date', () => {
    const parsed = pantryBatchInputSchema.parse({
      productId: crypto.randomUUID(),
      locationId: crypto.randomUUID(),
      quantityRemaining: 300,
      unit: 'g',
      bestBeforeDate: '2027-04-02',
    });

    expect(parsed).toMatchObject({
      purchaseDate: null,
      bestBeforeDate: '2027-04-02',
      useByDate: null,
      sellByDate: null,
      openedDate: null,
      frozenDate: null,
      thawedDate: null,
      preparedDate: null,
    });
  });

  it('requires exactly one of exact or approximate measurement', () => {
    const base = { productId: crypto.randomUUID(), locationId: crypto.randomUUID() };

    expect(
      pantryBatchInputSchema.safeParse({
        ...base,
        quantityRemaining: 2,
        unit: 'each',
        approximateState: 'half',
      }).success,
    ).toBe(false);
    expect(
      pantryBatchInputSchema.safeParse({
        ...base,
        quantityRemaining: null,
        originalQuantity: 2,
        approximateState: 'half',
      }).success,
    ).toBe(false);
    expect(
      pantryBatchActionSchema.safeParse({
        type: 'correct',
        expectedVersion: 1,
        note: '',
        quantityRemaining: 2,
        unit: 'each',
        approximateState: 'half',
        reason: 'Counted again',
      }).success,
    ).toBe(false);
  });

  it('validates optimistic split and combine action contracts', () => {
    expect(
      pantryBatchActionSchema.parse({
        type: 'split',
        expectedVersion: 3,
        quantity: 250,
        unit: 'g',
        locationId: '',
        note: 'Divide between shelves',
      }),
    ).toMatchObject({ type: 'split', quantity: 250, expectedVersion: 3 });
    expect(
      pantryBatchActionSchema.parse({
        type: 'combine',
        expectedVersion: 4,
        targetBatchId: crypto.randomUUID(),
        targetExpectedVersion: 2,
        note: '',
      }),
    ).toMatchObject({ type: 'combine', targetExpectedVersion: 2 });
  });
});

describe('Pantry inventory units', () => {
  it('normalizes familiar aliases and converts within a dimension', () => {
    expect(normalizeInventoryUnit('Tablespoons')).toBe('tbsp');
    expect(convertInventoryQuantity(1, 'kg', 'g')).toBe(1_000);
    expect(convertInventoryQuantity(2, 'cup', 'ml')).toBeCloseTo(473.176, 3);
    expect(convertInventoryQuantity(1, 'dozen', 'each')).toBe(12);
  });

  it('never converts between incompatible dimensions', () => {
    expect(areInventoryUnitsCompatible('g', 'ml')).toBe(false);
    expect(() => convertInventoryQuantity(1, 'cup', 'g')).toThrow(/incompatible unit/i);
    expect(inventoryUnitDimension('mystery scoop')).toBe('unknown');
  });
});

describe('Pantry expiry state', () => {
  const now = new Date('2026-07-18T12:00:00Z');

  it('prioritizes use-by over best-before and reports urgency', () => {
    expect(
      pantryExpiryState(
        {
          useByDate: '2026-07-20',
          bestBeforeDate: '2026-08-01',
          sellByDate: null,
          openedDate: null,
        },
        null,
        now,
      ),
    ).toEqual({ state: 'soon', kind: 'use_by', date: '2026-07-20', days: 2 });
  });

  it('derives an opened shelf-life date when no printed date exists', () => {
    expect(
      pantryExpiryState(
        {
          useByDate: null,
          bestBeforeDate: null,
          sellByDate: null,
          openedDate: '2026-07-10',
        },
        5,
        now,
      ),
    ).toEqual({ state: 'expired', kind: 'opened_shelf_life', date: '2026-07-15', days: -3 });
  });

  it('uses opened shelf life when it expires before a printed date', () => {
    expect(
      pantryExpiryState(
        {
          useByDate: '2026-08-01',
          bestBeforeDate: null,
          sellByDate: null,
          openedDate: '2026-07-10',
        },
        5,
        now,
      ),
    ).toEqual({ state: 'expired', kind: 'opened_shelf_life', date: '2026-07-15', days: -3 });
  });

  it('keeps unknown expiry visibly distinct from fresh stock', () => {
    expect(
      pantryExpiryState(
        { useByDate: null, bestBeforeDate: null, sellByDate: null, openedDate: null },
        null,
        now,
      ).state,
    ).toBe('unknown');
  });
});
