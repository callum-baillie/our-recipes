import { z } from 'zod';

export const cookSessionStartSchema = z.object({
  recipeId: z.string().uuid(),
  targetServings: z.coerce.number().int().min(1).max(100),
});

export function recipeYieldNumber(servings: string): number | null {
  const value = Number.parseFloat(servings);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function scaledQuantity(
  quantity: number | null,
  recipeServings: string,
  targetServings: number,
): number | null {
  const sourceServings = recipeYieldNumber(recipeServings);
  if (quantity === null || sourceServings === null) return quantity;
  return Number((quantity * (targetServings / sourceServings)).toFixed(3));
}

export function convertTemperature(value: number, from: 'C' | 'F'): number {
  return from === 'C' ? Math.round((value * 9) / 5 + 32) : Math.round(((value - 32) * 5) / 9);
}
