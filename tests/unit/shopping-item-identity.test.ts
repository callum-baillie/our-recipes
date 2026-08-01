import { describe, expect, it } from 'vitest';

import {
  mergeShoppingItemNotes,
  preferredShoppingItemLabel,
  shoppingItemIdentity,
} from '@/lib/domain/shopping-item-identity';

describe('shopping item identity', () => {
  it('merges superficial singular and plural variants', () => {
    expect(shoppingItemIdentity('Tomatoes')).toBe('tomato');
    expect(shoppingItemIdentity('tomato')).toBe('tomato');
    expect(preferredShoppingItemLabel('tomatoes', 'tomato')).toBe('tomato');
  });

  it('preserves purchasing qualifiers that make ingredients distinct', () => {
    expect(shoppingItemIdentity('flour tortillas')).toBe('flour tortilla');
    expect(shoppingItemIdentity('large flour tortillas')).toBe('large flour tortilla');
    expect(shoppingItemIdentity('corn tortillas')).not.toBe(
      shoppingItemIdentity('large flour tortillas'),
    );
  });

  it('keeps distinct preparation notes on one combined shopping item', () => {
    expect(mergeShoppingItemNotes('diced', 'for garnish')).toBe('diced; for garnish');
    expect(mergeShoppingItemNotes('diced', 'DICED')).toBe('diced');
  });
});
