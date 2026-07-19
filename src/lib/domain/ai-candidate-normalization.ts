import type { AiRecipeCandidate } from '@/lib/domain/ai';

const UNICODE_FRACTIONS = new Map([
  ['¼', 0.25],
  ['½', 0.5],
  ['¾', 0.75],
  ['⅓', 1 / 3],
  ['⅔', 2 / 3],
  ['⅛', 0.125],
  ['⅜', 0.375],
  ['⅝', 0.625],
  ['⅞', 0.875],
]);

const CANONICAL_UNITS = new Map<string, string>([
  ['c', 'cup'],
  ['cup', 'cup'],
  ['cups', 'cup'],
  ['tbsp', 'tbsp'],
  ['tablespoon', 'tbsp'],
  ['tablespoons', 'tbsp'],
  ['tsp', 'tsp'],
  ['teaspoon', 'tsp'],
  ['teaspoons', 'tsp'],
  ['g', 'g'],
  ['gram', 'g'],
  ['grams', 'g'],
  ['kg', 'kg'],
  ['kilogram', 'kg'],
  ['kilograms', 'kg'],
  ['ml', 'ml'],
  ['milliliter', 'ml'],
  ['milliliters', 'ml'],
  ['millilitre', 'ml'],
  ['millilitres', 'ml'],
  ['l', 'L'],
  ['liter', 'L'],
  ['liters', 'L'],
  ['litre', 'L'],
  ['litres', 'L'],
  ['oz', 'oz'],
  ['ounce', 'oz'],
  ['ounces', 'oz'],
  ['lb', 'lb'],
  ['lbs', 'lb'],
  ['pound', 'lb'],
  ['pounds', 'lb'],
  ['clove', 'clove'],
  ['cloves', 'clove'],
  ['can', 'can'],
  ['cans', 'can'],
  ['tin', 'tin'],
  ['tins', 'tin'],
  ['packet', 'packet'],
  ['packets', 'packet'],
  ['pinch', 'pinch'],
  ['pinches', 'pinch'],
]);

const NUMBER_TOKEN = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const LEADING_AMOUNT = new RegExp(
  String.raw`^(?<lower>${NUMBER_TOKEN})(?:\s*[–—-]\s*(?<upper>${NUMBER_TOKEN}))?(?=$|\s|[,;])`,
  'u',
);

type ExtractedMeasurement = {
  quantity: number;
  unit: string;
  remainder: string;
  upperQuantity: number | null;
};

function parseNumberToken(value: string): number | null {
  const unicode = UNICODE_FRACTIONS.get(value);
  if (unicode !== undefined) return unicode;
  if (value.includes(' ')) {
    const [whole, fraction] = value.split(/\s+/u);
    const parsedFraction = fraction ? parseNumberToken(fraction) : null;
    const parsedWhole = Number(whole);
    return parsedFraction === null || !Number.isFinite(parsedWhole)
      ? null
      : parsedWhole + parsedFraction;
  }
  if (value.includes('/')) {
    const [numerator, denominator] = value.split('/').map(Number);
    return numerator !== undefined && denominator ? numerator / denominator : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractLeadingMeasurement(value: string): ExtractedMeasurement | null {
  const trimmed = value.trim();
  const match = LEADING_AMOUNT.exec(trimmed);
  const lowerToken = match?.groups?.lower;
  if (!match || !lowerToken) return null;
  const quantity = parseNumberToken(lowerToken);
  if (quantity === null) return null;

  let remainder = trimmed
    .slice(match[0].length)
    .replace(/^[\s,;:]+/u, '')
    .trim();
  let unit = '';
  const firstWord = remainder.match(/^([a-zA-Z]+\.?)(?=$|\s|[,;])/u)?.[1];
  if (firstWord) {
    const canonical = CANONICAL_UNITS.get(firstWord.toLocaleLowerCase().replace(/\.$/u, ''));
    if (canonical) {
      unit = canonical;
      remainder = remainder
        .slice(firstWord.length)
        .replace(/^[\s,;:]+/u, '')
        .trim();
    }
  }

  return {
    quantity,
    unit,
    remainder,
    upperQuantity: match.groups?.upper ? parseNumberToken(match.groups.upper) : null,
  };
}

function rangeNote(measurement: ExtractedMeasurement): string {
  const upper = measurement.upperQuantity;
  const range =
    upper === null ? '' : `up to ${upper}${measurement.unit ? ` ${measurement.unit}` : ''}`;
  return [range, measurement.remainder].filter(Boolean).join('; ');
}

function rangeOnlyNote(measurement: ExtractedMeasurement): string {
  const upper = measurement.upperQuantity;
  return upper === null ? '' : `up to ${upper}${measurement.unit ? ` ${measurement.unit}` : ''}`;
}

/**
 * Keeps the model's structured contract strict while repairing a common OCR
 * failure mode where a leading amount is placed in the note or item text.
 */
export function normalizeAiRecipeCandidate(candidate: AiRecipeCandidate): AiRecipeCandidate {
  return {
    ...candidate,
    recipe: {
      ...candidate.recipe,
      ingredientGroups: candidate.recipe.ingredientGroups.map((group) => ({
        ...group,
        ingredients: group.ingredients.map((ingredient) => {
          if (ingredient.quantity !== '') return ingredient;

          const fromNote = extractLeadingMeasurement(ingredient.note);
          if (fromNote) {
            return {
              ...ingredient,
              quantity: fromNote.quantity,
              unit: ingredient.unit || fromNote.unit,
              note: rangeNote(fromNote),
            };
          }

          const fromItem = extractLeadingMeasurement(ingredient.item);
          if (!fromItem || !fromItem.remainder) return ingredient;
          return {
            ...ingredient,
            quantity: fromItem.quantity,
            unit: ingredient.unit || fromItem.unit,
            item: fromItem.remainder,
            note: [rangeOnlyNote(fromItem), ingredient.note].filter(Boolean).join('; '),
          };
        }),
      })),
    },
  };
}
