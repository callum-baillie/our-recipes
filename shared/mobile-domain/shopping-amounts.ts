export type ShoppingAmounts = {
  quantity?: number | null;
  unit?: string | null;
  cartQuantity?: number | null;
  cartUnit?: string | null;
};
export function amountLabel(amount: number | null | undefined, unit: string | null | undefined) {
  return amount == null
    ? `Amount not recorded${unit ? ` (${unit})` : ''}`
    : `${amount}${unit ? ` ${unit}` : ' (unit not recorded)'}`;
}
/** Demand and the reviewed purchase have independent dimensions; legacy missing units stay unknown. */
export function shoppingAmountSummary(item: ShoppingAmounts) {
  return {
    requested: amountLabel(item.quantity, item.unit),
    cart: amountLabel(item.cartQuantity, item.cartUnit),
    purchaseQuantity: item.cartQuantity == null ? '' : String(item.cartQuantity),
    purchaseUnit: item.cartUnit ?? '',
  };
}
