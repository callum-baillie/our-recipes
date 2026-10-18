import { formatScaledQuantity } from './ingredient-scaling';

/** Display rounding only: demand and purchased quantities retain their precision. */
export function formatShoppingQuantity(quantity: number, unit: string): string {
  if (!Number.isFinite(quantity)) return 'Quantity not set';
  const normalized = unit.trim();
  const measured = /^(g|grams?|ml|millilit(er|re)s?)$/i.test(normalized);
  const amount =
    quantity === 0
      ? '0'
      : quantity > 0 && quantity < 0.025
        ? '<0.025'
        : measured && quantity >= 10
          ? String(Math.round(quantity))
          : formatScaledQuantity(quantity);
  return `${amount}${normalized ? ` ${normalized}` : ''}`;
}
