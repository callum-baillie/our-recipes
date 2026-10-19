import { formatShoppingQuantity } from './shopping-quantity';
export function printedPantryDate(batch: {
  expiry: { kind: string; date: string | null };
  expiryPrecision: string;
}) {
  if (!batch.expiry.date) return 'No expiry recorded';
  if (batch.expiry.kind === 'opened_shelf_life')
    return `Calculated after opening: ${batch.expiry.date}`;
  const label =
    (
      { use_by: 'Use by', best_before: 'Best before', sell_by: 'Sell by' } as Record<string, string>
    )[batch.expiry.kind] ?? 'Recorded date';
  const precision = batch.expiryPrecision;
  return `${label}: ${precision === 'month_only' ? batch.expiry.date.slice(0, 7) : batch.expiry.date}${precision === 'estimated' ? ' (estimated)' : precision === 'month_only' ? ' (month only)' : precision === 'unknown' ? ' (precision not recorded)' : ''}`;
}
export function printedShoppingItem(item: {
  item: string;
  quantity: number | null;
  unit: string;
  checked: boolean;
  shoppingState: string;
  cartQuantity: number;
  cartLabel: string;
  note: string;
}) {
  const state = item.checked ? 'sourced' : item.shoppingState;
  const cart =
    state === 'in_cart' || item.cartLabel
      ? `Cart: ${item.cartLabel || item.item} · ${formatShoppingQuantity(item.cartQuantity, item.unit)}`
      : '';
  return {
    label: item.item,
    quantity:
      item.quantity === null
        ? `To buy: not recorded${item.unit ? ` (${item.unit})` : ''}`
        : `${formatShoppingQuantity(item.quantity, item.unit)} to buy`,
    state,
    detail: cart,
    note: item.note,
  };
}
