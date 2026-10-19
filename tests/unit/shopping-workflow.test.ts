import { describe, expect, it } from 'vitest';
import { shoppingWorkflow, moveShoppingItem } from '@/lib/domain/shopping-workflow';
import { inventoryCountState, restoreInventoryCounts } from '@/lib/domain/inventory-count';
describe('shopping workflow scope and visible movement', () => {
  const items = [
    { id: 'a', position: 0, checked: false, shoppingState: 'to_buy' as const },
    { id: 'hidden', position: 1, checked: false, shoppingState: 'cant_find' as const },
    { id: 'c', position: 2, checked: true, shoppingState: 'sourced' as const },
  ];
  it('retains unresolved items independently of a displayed search subset', () => {
    const displayed = items.filter((item) => item.id === 'c');
    expect(shoppingWorkflow(displayed).toBuy).toHaveLength(0);
    expect(shoppingWorkflow(items).toBuy.map((item) => item.id)).toEqual(['a']);
    expect(shoppingWorkflow(items).cantFind.map((item) => item.id)).toEqual(['hidden']);
  });
  it('updates positions immediately, swapping only visible neighbours and retaining all IDs', () => {
    const next = moveShoppingItem(items, [items[0], items[2]], 'a', 1)!;
    expect(next.map((item) => [item.id, item.position])).toEqual([
      ['c', 0],
      ['hidden', 1],
      ['a', 2],
    ]);
    expect([...next].sort((a, b) => a.position - b.position).map((item) => item.id)).toEqual([
      'c',
      'hidden',
      'a',
    ]);
    expect(moveShoppingItem(items, items, 'a', -1)).toBeNull();
  });
});
describe('physical count readiness and recovery', () => {
  const baseline = { quantity: 2, unit: 'g', version: 4 };
  it('treats unit-only corrections as changes and reversion as clean', () => {
    expect(inventoryCountState(baseline, { quantity: '2', unit: 'kg', version: 4 })).toMatchObject({
      dirty: true,
      valid: true,
    });
    expect(inventoryCountState(baseline, { quantity: '2.0', unit: 'g', version: 4 })).toMatchObject(
      { dirty: false, valid: true },
    );
    expect(inventoryCountState(baseline, { quantity: '2', unit: '', version: 4 })).toMatchObject({
      dirty: true,
      valid: false,
    });
  });
  it('preserves unknown, explicit zero, fractions and incomplete drafts distinctly', () => {
    expect(inventoryCountState({ quantity: null, unit: 'g', version: 1 })).toMatchObject({
      quantity: null,
      valid: false,
    });
    expect(inventoryCountState(baseline, { quantity: '0', unit: 'g', version: 4 })).toMatchObject({
      quantity: 0,
      valid: true,
    });
    expect(
      inventoryCountState(baseline, { quantity: '0.25', unit: 'g', version: 4 }),
    ).toMatchObject({ quantity: 0.25, valid: true });
    const restored = restoreInventoryCounts(
      JSON.stringify({
        a: { quantity: '', unit: '', version: 4 },
        bad: { quantity: '1', unit: 'g', version: 2 },
        other: { quantity: {}, unit: 'g', version: 1 },
      }),
      new Set(['a', 'other']),
    );
    expect(restored).toEqual({ a: { quantity: '', unit: '', version: 4 } });
  });
});
