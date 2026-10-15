import { z } from 'zod';

export const instacartRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().trim().min(1).max(200),
            upc: z
              .string()
              .trim()
              .regex(/^(?:\d{12}|\d{14})?$/, 'Use a 12- or 14-digit UPC.')
              .default(''),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ items }, ctx) => {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      ctx.addIssue({ code: 'custom', message: 'Choose each item only once.' });
    const upcs = items.map((item) => item.upc).filter(Boolean);
    if (new Set(upcs).size !== upcs.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Use each UPC only once. Combine duplicate products first.',
      });
    items.forEach((item, index) => {
      if (!item.upc) return;
      const digits = [...item.upc].map(Number).reverse();
      if (digits.reduce((sum, digit, i) => sum + digit * (i % 2 ? 3 : 1), 0) % 10)
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'upc'],
          message: 'Check the UPC digits.',
        });
    });
  });

const units: Record<string, string> = {
  each: 'each',
  item: 'each',
  items: 'each',
  pc: 'each',
  pcs: 'each',
  g: 'gram',
  gram: 'gram',
  grams: 'gram',
  kg: 'kilogram',
  kilogram: 'kilogram',
  kilograms: 'kilogram',
  oz: 'ounce',
  ounce: 'ounce',
  ounces: 'ounce',
  lb: 'pound',
  lbs: 'pound',
  pound: 'pound',
  pounds: 'pound',
  ml: 'milliliter',
  milliliter: 'milliliter',
  milliliters: 'milliliter',
  l: 'liter',
  liter: 'liter',
  litre: 'liter',
  liters: 'liter',
  litres: 'liter',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tablespoon',
  tablespoon: 'tablespoon',
  tsp: 'teaspoon',
  teaspoon: 'teaspoon',
  gal: 'gallon',
  gallon: 'gallon',
  gallons: 'gallon',
  pint: 'pint',
  pt: 'pint',
  quart: 'quart',
  qt: 'quart',
  can: 'can',
  cans: 'can',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  package: 'package',
  packages: 'package',
  packet: 'packet',
};
export function instacartMeasurement(quantity: number | null, unit: string) {
  const normalized = units[unit.trim().toLowerCase() || 'each'];
  return quantity !== null && Number.isFinite(quantity) && quantity > 0 && normalized
    ? [{ quantity, unit: normalized }]
    : undefined;
}
