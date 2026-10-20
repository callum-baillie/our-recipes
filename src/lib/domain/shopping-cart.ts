import { areInventoryUnitsCompatible, convertInventoryQuantity } from './inventory-units';

export type CartAmount = {
  cartQuantity: number;
  cartUnit?: string | null;
  quantity: number | null;
  unit: string;
};

/** Compare only compatible, explicitly recorded purchase and demand dimensions. */
export function cartDemandCoverage(item: CartAmount): {
  complete: boolean;
  remaining: number | null;
} {
  if (item.cartUnit == null || !areInventoryUnitsCompatible(item.cartUnit, item.unit))
    return { complete: false, remaining: null };
  if (item.quantity === null) return { complete: false, remaining: null };
  const bought = convertInventoryQuantity(item.cartQuantity, item.cartUnit, item.unit);
  return { complete: bought >= item.quantity, remaining: Math.max(0, item.quantity - bought) };
}

/** Old rows never lend an unrecorded dimension to Pantry intake. */
export function shoppingPurchaseDraft(item: CartAmount): { quantity: string; unit: string } {
  if (item.cartUnit == null) return { quantity: '', unit: '' };
  return { quantity: String(item.cartQuantity), unit: item.cartUnit };
}
