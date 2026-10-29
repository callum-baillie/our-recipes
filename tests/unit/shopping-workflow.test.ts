import { describe, expect, it } from 'vitest';
import { shoppingWorkflow, moveShoppingItem } from '@/lib/domain/shopping-workflow';
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
