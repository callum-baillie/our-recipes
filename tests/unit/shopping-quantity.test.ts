import { describe, it, expect } from 'vitest';
import { formatShoppingQuantity } from '@/lib/domain/shopping-quantity';
describe('shopping quantities', () => {
  it('uses fractions for kitchen measures and whole grams for large amounts', () => {
    expect(formatShoppingQuantity(0.666667, 'tbsp')).toBe('⅔ tbsp');
    expect(formatShoppingQuantity(333.333333, 'g')).toBe('333 g');
    expect(formatShoppingQuantity(6, 'each')).toBe('6 each');
  });
  it('does not display tiny demand as zero or invent missing amounts', () => {
    expect(formatShoppingQuantity(0, 'g')).toBe('0 g');
    expect(formatShoppingQuantity(0.001, 'g')).toBe('<0.025 g');
    expect(formatShoppingQuantity(NaN, 'g')).toBe('Quantity not set');
  });
});
