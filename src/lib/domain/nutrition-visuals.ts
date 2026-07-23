export const NUTRITION_VISUAL_KEYS = [
  'energy',
  'carbohydrate',
  'fat',
  'protein',
  'fiber',
  'grain',
  'sugar',
  'mineral',
  'other',
] as const;

export type NutritionVisualKey = (typeof NUTRITION_VISUAL_KEYS)[number];

export type NutritionVisual = {
  key: NutritionVisualKey;
  label: string;
  color: `var(--nutrition-${NutritionVisualKey})`;
  softColor: `var(--nutrition-${NutritionVisualKey}-soft)`;
};

const VISUALS: Record<NutritionVisualKey, NutritionVisual> = Object.fromEntries(
  NUTRITION_VISUAL_KEYS.map((key) => [
    key,
    {
      key,
      label: {
        energy: 'Energy',
        carbohydrate: 'Carbohydrate',
        fat: 'Fat',
        protein: 'Protein',
        fiber: 'Fiber and vegetables',
        grain: 'Grains and micronutrients',
        sugar: 'Sugars and fruit',
        mineral: 'Minerals and dairy',
        other: 'Other nutrients',
      }[key],
      color: `var(--nutrition-${key})`,
      softColor: `var(--nutrition-${key}-soft)`,
    },
  ]),
) as Record<NutritionVisualKey, NutritionVisual>;

const CODE_VISUALS: Record<string, NutritionVisualKey> = {
  energy: 'energy',
  energy_kcal: 'energy',
  carbohydrate: 'carbohydrate',
  carbohydrates: 'carbohydrate',
  starch: 'carbohydrate',
  total_fat: 'fat',
  fat: 'fat',
  saturated_fat: 'fat',
  monounsaturated_fat: 'fat',
  polyunsaturated_fat: 'fat',
  cholesterol: 'fat',
  protein: 'protein',
  fiber: 'fiber',
  dietary_fiber: 'fiber',
  whole_grains: 'grain',
  sugar: 'sugar',
  sugars: 'sugar',
  added_sugars: 'sugar',
  calcium: 'mineral',
  iron: 'mineral',
  magnesium: 'mineral',
  potassium: 'mineral',
  sodium: 'mineral',
  zinc: 'mineral',
};

export function resolveNutritionVisual(
  nutrientCode: string,
  category?: string | null,
): NutritionVisual {
  const normalizedCode = nutrientCode.trim().toLowerCase();
  const direct = CODE_VISUALS[normalizedCode];
  if (direct) return VISUALS[direct];

  const normalizedCategory = category?.trim().toLowerCase() ?? '';
  if (normalizedCategory === 'energy') return VISUALS.energy;
  if (normalizedCategory === 'macronutrient') return VISUALS.other;
  if (normalizedCategory.includes('vitamin') || normalizedCategory.includes('micronutrient')) {
    return VISUALS.grain;
  }
  if (normalizedCategory.includes('mineral') || normalizedCategory.includes('electrolyte')) {
    return VISUALS.mineral;
  }
  return VISUALS.other;
}

export function nutritionVisuals(): NutritionVisual[] {
  return NUTRITION_VISUAL_KEYS.map((key) => VISUALS[key]);
}
