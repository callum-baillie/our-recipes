const PLACEHOLDER_SERVINGS =
  /^(?:-|unknown|unspecified|n\/?a|none|review(?: servings)?|to review)$/iu;

const FRACTIONS: Array<[number, string]> = [
  [1 / 8, '⅛'],
  [1 / 6, '⅙'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [5 / 6, '⅚'],
  [7 / 8, '⅞'],
];

function numericToken(value: string): number | null {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/u.exec(value);
  if (mixed && Number(mixed[3]) > 0) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = /^(\d+)\/(\d+)$/u.exec(value);
  if (fraction && Number(fraction[2]) > 0) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = Number(value);
  return Number.isFinite(decimal) ? decimal : null;
}

export function parseServingCount(value: string): number | null {
  const compact = value.trim();
  if (!compact || PLACEHOLDER_SERVINGS.test(compact)) return null;
  const match = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/u.exec(compact);
  if (!match) return null;
  const count = numericToken(match[1]!);
  return count && count > 0 && count <= 1_000 ? count : null;
}

export function formatScaledQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const whole = Math.floor(value + 1e-8);
  const remainder = value - whole;
  if (remainder < 0.025) return String(whole);
  const fraction = FRACTIONS.reduce<{ difference: number; label: string } | null>(
    (best, [candidate, label]) => {
      const difference = Math.abs(remainder - candidate);
      return !best || difference < best.difference ? { difference, label } : best;
    },
    null,
  );
  if (fraction && fraction.difference <= 0.025) {
    return whole ? `${whole} ${fraction.label}` : fraction.label;
  }
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function normalizedUnit(unit: string): string {
  return unit.trim().toLocaleLowerCase().replace(/\.$/u, '');
}

function namedUnit(unit: string, quantity: number): string {
  if (unit === 'cup') return quantity === 1 ? 'cup' : 'cups';
  if (unit === 'tbsp') return 'tbsp';
  if (unit === 'tsp') return 'tsp';
  if (unit === 'kg') return 'kg';
  if (unit === 'g') return 'g';
  if (unit === 'l') return 'L';
  if (unit === 'ml') return 'ml';
  if (unit === 'lb') return quantity === 1 ? 'lb' : 'lb';
  if (unit === 'oz') return 'oz';
  return unit;
}

const VOLUME_TO_TEASPOONS = new Map<string, number>([
  ['cup', 48],
  ['cups', 48],
  ['c', 48],
  ['tbsp', 3],
  ['tbs', 3],
  ['tablespoon', 3],
  ['tablespoons', 3],
  ['tsp', 1],
  ['teaspoon', 1],
  ['teaspoons', 1],
]);

export function scaleIngredientMeasurement(
  quantity: number | null,
  unit: string,
  multiplier: number,
): { quantity: string; unit: string } {
  if (quantity === null || !Number.isFinite(multiplier) || multiplier <= 0) {
    return { quantity: quantity === null ? '' : formatScaledQuantity(quantity), unit };
  }

  const sourceUnit = normalizedUnit(unit);
  const volumeFactor = VOLUME_TO_TEASPOONS.get(sourceUnit);
  if (volumeFactor) {
    const teaspoons = quantity * multiplier * volumeFactor;
    const targetUnit = teaspoons >= 12 ? 'cup' : teaspoons >= 3 ? 'tbsp' : 'tsp';
    const targetQuantity = teaspoons / (targetUnit === 'cup' ? 48 : targetUnit === 'tbsp' ? 3 : 1);
    return {
      quantity: formatScaledQuantity(targetQuantity),
      unit: namedUnit(targetUnit, targetQuantity),
    };
  }

  if (['kg', 'kilogram', 'kilograms', 'g', 'gram', 'grams'].includes(sourceUnit)) {
    const grams = quantity * multiplier * (sourceUnit.startsWith('k') ? 1_000 : 1);
    const targetUnit = grams >= 1_000 ? 'kg' : 'g';
    const targetQuantity = targetUnit === 'kg' ? grams / 1_000 : grams;
    return { quantity: formatScaledQuantity(targetQuantity), unit: targetUnit };
  }

  if (
    ['l', 'liter', 'liters', 'litre', 'litres', 'ml', 'milliliter', 'milliliters'].includes(
      sourceUnit,
    )
  ) {
    const milliliters =
      quantity * multiplier * (sourceUnit === 'ml' || sourceUnit.startsWith('milli') ? 1 : 1_000);
    const targetUnit = milliliters >= 1_000 ? 'l' : 'ml';
    const targetQuantity = targetUnit === 'l' ? milliliters / 1_000 : milliliters;
    return {
      quantity: formatScaledQuantity(targetQuantity),
      unit: namedUnit(targetUnit, targetQuantity),
    };
  }

  if (['lb', 'lbs', 'pound', 'pounds', 'oz', 'ounce', 'ounces'].includes(sourceUnit)) {
    const ounces =
      quantity * multiplier * (sourceUnit.startsWith('l') || sourceUnit.startsWith('p') ? 16 : 1);
    const targetUnit = ounces >= 16 ? 'lb' : 'oz';
    const targetQuantity = targetUnit === 'lb' ? ounces / 16 : ounces;
    return {
      quantity: formatScaledQuantity(targetQuantity),
      unit: namedUnit(targetUnit, targetQuantity),
    };
  }

  return { quantity: formatScaledQuantity(quantity * multiplier), unit };
}
