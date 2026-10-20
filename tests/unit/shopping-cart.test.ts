import { expect, it } from 'vitest';
import { cartDemandCoverage, shoppingPurchaseDraft } from '@/lib/domain/shopping-cart';

it('keeps the purchase dimension separate from recipe demand, including zero and legacy unknowns', () => {
  const item = { quantity: 2, unit: 'each', cartQuantity: 500, cartUnit: 'g' };
  expect(shoppingPurchaseDraft(item)).toEqual({ quantity: '500', unit: 'g' });
  expect(cartDemandCoverage(item)).toEqual({ complete: false, remaining: null });
  expect(cartDemandCoverage({ ...item, quantity: 1, unit: 'kg' })).toEqual({
    complete: false,
    remaining: 0.5,
  });
  expect(cartDemandCoverage({ ...item, unit: 'ml' }).remaining).toBeNull();
  expect(shoppingPurchaseDraft({ ...item, cartUnit: null })).toEqual({ quantity: '', unit: '' });
  expect(shoppingPurchaseDraft({ ...item, cartQuantity: 0 })).toEqual({ quantity: '0', unit: 'g' });
  expect(cartDemandCoverage({ ...item, quantity: null }).remaining).toBeNull();
});
