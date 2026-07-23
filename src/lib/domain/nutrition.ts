export const NUTRIENT_CODES = [
  'energy_kcal',
  'energy_kj',
  'protein',
  'carbohydrate',
  'fiber',
  'total_sugars',
  'added_sugars',
  'sugar_alcohols',
  'total_fat',
  'saturated_fat',
  'monounsaturated_fat',
  'polyunsaturated_fat',
  'trans_fat',
  'omega_3',
  'omega_6',
  'cholesterol',
  'alcohol',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'phosphorus',
  'zinc',
  'copper',
  'manganese',
  'selenium',
  'iodine',
  'vitamin_a',
  'vitamin_c',
  'vitamin_d',
  'vitamin_e',
  'vitamin_k',
  'thiamin',
  'riboflavin',
  'niacin',
  'pantothenic_acid',
  'vitamin_b6',
  'biotin',
  'folate',
  'vitamin_b12',
  'choline',
  'water',
  'caffeine',
  'serving_weight',
  'edible_portion_weight',
] as const;

export type NutrientCode = (typeof NUTRIENT_CODES)[number];
export type NutrientCategory = 'energy' | 'macronutrient' | 'mineral' | 'vitamin' | 'other';
export type NutrientUnit = 'kcal' | 'kJ' | 'g' | 'mg' | 'mcg' | 'mcg RAE' | 'mcg DFE';
export type NutrientSemantic = 'target' | 'minimum' | 'range' | 'limit' | 'informational';

export type NutrientDefinition = {
  code: NutrientCode;
  canonicalName: string;
  displayName: string;
  aliases: readonly string[];
  category: NutrientCategory;
  canonicalUnit: NutrientUnit;
  displayPrecision: number;
  defaultSemantic: NutrientSemantic;
  upperReferencePossible: boolean;
  defaultDashboard: boolean;
  displayOrder: number;
};

type DefinitionInput = Omit<NutrientDefinition, 'canonicalName' | 'aliases'> & {
  canonicalName?: string;
  aliases?: readonly string[];
};

function nutrient(input: DefinitionInput): NutrientDefinition {
  return {
    ...input,
    canonicalName: input.canonicalName ?? input.code,
    aliases: input.aliases ?? [],
  };
}

export const NUTRIENT_DEFINITIONS: readonly NutrientDefinition[] = [
  nutrient({
    code: 'energy_kcal',
    displayName: 'Calories',
    aliases: ['kilocalories', 'kcal'],
    category: 'energy',
    canonicalUnit: 'kcal',
    displayPrecision: 0,
    defaultSemantic: 'target',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 10,
  }),
  nutrient({
    code: 'energy_kj',
    displayName: 'Energy',
    aliases: ['kilojoules', 'kj'],
    category: 'energy',
    canonicalUnit: 'kJ',
    displayPrecision: 0,
    defaultSemantic: 'target',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 20,
  }),
  nutrient({
    code: 'protein',
    displayName: 'Protein',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 30,
  }),
  nutrient({
    code: 'carbohydrate',
    displayName: 'Total carbohydrate',
    aliases: ['carbs'],
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'range',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 40,
  }),
  nutrient({
    code: 'fiber',
    displayName: 'Dietary fiber',
    aliases: ['fibre'],
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 50,
  }),
  nutrient({
    code: 'total_sugars',
    displayName: 'Total sugars',
    aliases: ['sugar'],
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 60,
  }),
  nutrient({
    code: 'added_sugars',
    displayName: 'Added sugars',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'limit',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 70,
  }),
  nutrient({
    code: 'sugar_alcohols',
    displayName: 'Sugar alcohols',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 80,
  }),
  nutrient({
    code: 'total_fat',
    displayName: 'Total fat',
    aliases: ['fat'],
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'range',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 90,
  }),
  nutrient({
    code: 'saturated_fat',
    displayName: 'Saturated fat',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'limit',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 100,
  }),
  nutrient({
    code: 'monounsaturated_fat',
    displayName: 'Monounsaturated fat',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 110,
  }),
  nutrient({
    code: 'polyunsaturated_fat',
    displayName: 'Polyunsaturated fat',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 120,
  }),
  nutrient({
    code: 'trans_fat',
    displayName: 'Trans fat',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'limit',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 130,
  }),
  nutrient({
    code: 'omega_3',
    displayName: 'Omega-3 fatty acids',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 2,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 140,
  }),
  nutrient({
    code: 'omega_6',
    displayName: 'Omega-6 fatty acids',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 2,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 150,
  }),
  nutrient({
    code: 'cholesterol',
    displayName: 'Cholesterol',
    category: 'macronutrient',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'limit',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 160,
  }),
  nutrient({
    code: 'alcohol',
    displayName: 'Alcohol',
    category: 'macronutrient',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'limit',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 170,
  }),
  nutrient({
    code: 'sodium',
    displayName: 'Sodium',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'limit',
    upperReferencePossible: true,
    defaultDashboard: true,
    displayOrder: 180,
  }),
  nutrient({
    code: 'potassium',
    displayName: 'Potassium',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: true,
    displayOrder: 190,
  }),
  nutrient({
    code: 'calcium',
    displayName: 'Calcium',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: true,
    displayOrder: 200,
  }),
  nutrient({
    code: 'iron',
    displayName: 'Iron',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: true,
    displayOrder: 210,
  }),
  nutrient({
    code: 'magnesium',
    displayName: 'Magnesium',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 220,
  }),
  nutrient({
    code: 'phosphorus',
    displayName: 'Phosphorus',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 230,
  }),
  nutrient({
    code: 'zinc',
    displayName: 'Zinc',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 240,
  }),
  nutrient({
    code: 'copper',
    displayName: 'Copper',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 2,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 250,
  }),
  nutrient({
    code: 'manganese',
    displayName: 'Manganese',
    category: 'mineral',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 260,
  }),
  nutrient({
    code: 'selenium',
    displayName: 'Selenium',
    category: 'mineral',
    canonicalUnit: 'mcg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 270,
  }),
  nutrient({
    code: 'iodine',
    displayName: 'Iodine',
    category: 'mineral',
    canonicalUnit: 'mcg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 280,
  }),
  nutrient({
    code: 'vitamin_a',
    displayName: 'Vitamin A',
    category: 'vitamin',
    canonicalUnit: 'mcg RAE',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 290,
  }),
  nutrient({
    code: 'vitamin_c',
    displayName: 'Vitamin C',
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 300,
  }),
  nutrient({
    code: 'vitamin_d',
    displayName: 'Vitamin D',
    category: 'vitamin',
    canonicalUnit: 'mcg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: true,
    displayOrder: 310,
  }),
  nutrient({
    code: 'vitamin_e',
    displayName: 'Vitamin E',
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 320,
  }),
  nutrient({
    code: 'vitamin_k',
    displayName: 'Vitamin K',
    category: 'vitamin',
    canonicalUnit: 'mcg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 330,
  }),
  nutrient({
    code: 'thiamin',
    displayName: 'Thiamin',
    aliases: ['vitamin b1'],
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 2,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 340,
  }),
  nutrient({
    code: 'riboflavin',
    displayName: 'Riboflavin',
    aliases: ['vitamin b2'],
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 2,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 350,
  }),
  nutrient({
    code: 'niacin',
    displayName: 'Niacin',
    aliases: ['vitamin b3'],
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 360,
  }),
  nutrient({
    code: 'pantothenic_acid',
    displayName: 'Pantothenic acid',
    aliases: ['vitamin b5'],
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 370,
  }),
  nutrient({
    code: 'vitamin_b6',
    displayName: 'Vitamin B6',
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 2,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 380,
  }),
  nutrient({
    code: 'biotin',
    displayName: 'Biotin',
    aliases: ['vitamin b7'],
    category: 'vitamin',
    canonicalUnit: 'mcg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 390,
  }),
  nutrient({
    code: 'folate',
    displayName: 'Folate',
    aliases: ['vitamin b9'],
    category: 'vitamin',
    canonicalUnit: 'mcg DFE',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 400,
  }),
  nutrient({
    code: 'vitamin_b12',
    displayName: 'Vitamin B12',
    category: 'vitamin',
    canonicalUnit: 'mcg',
    displayPrecision: 1,
    defaultSemantic: 'minimum',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 410,
  }),
  nutrient({
    code: 'choline',
    displayName: 'Choline',
    category: 'vitamin',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'minimum',
    upperReferencePossible: true,
    defaultDashboard: false,
    displayOrder: 420,
  }),
  nutrient({
    code: 'water',
    displayName: 'Water',
    category: 'other',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 430,
  }),
  nutrient({
    code: 'caffeine',
    displayName: 'Caffeine',
    category: 'other',
    canonicalUnit: 'mg',
    displayPrecision: 0,
    defaultSemantic: 'limit',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 440,
  }),
  nutrient({
    code: 'serving_weight',
    displayName: 'Serving weight',
    category: 'other',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 450,
  }),
  nutrient({
    code: 'edible_portion_weight',
    displayName: 'Edible portion weight',
    category: 'other',
    canonicalUnit: 'g',
    displayPrecision: 1,
    defaultSemantic: 'informational',
    upperReferencePossible: false,
    defaultDashboard: false,
    displayOrder: 460,
  }),
];

export const DEFAULT_DASHBOARD_NUTRIENTS = NUTRIENT_DEFINITIONS.filter(
  (definition) => definition.defaultDashboard,
).map((definition) => definition.code);

export type NutrientAmounts = Partial<Record<NutrientCode, number>>;

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function fraction(value: number, label: string): number {
  finiteNonNegative(value, label);
  if (value > 1) throw new Error(`${label} must be between 0 and 1.`);
  return value;
}

export function normalizeNutrientAmounts(amounts: NutrientAmounts): NutrientAmounts {
  const normalized: NutrientAmounts = {};
  for (const code of NUTRIENT_CODES) {
    const value = amounts[code];
    if (value !== undefined) normalized[code] = finiteNonNegative(value, code);
  }
  return normalized;
}

export function nutrientAmount(amounts: NutrientAmounts, code: NutrientCode): number | null {
  return amounts[code] ?? null;
}

export function addNutrientAmounts(amounts: readonly NutrientAmounts[]): NutrientAmounts {
  const total: NutrientAmounts = {};
  for (const input of amounts) {
    const normalized = normalizeNutrientAmounts(input);
    for (const code of NUTRIENT_CODES) {
      const value = normalized[code];
      if (value !== undefined) total[code] = (total[code] ?? 0) + value;
    }
  }
  return total;
}

export function scaleNutrientAmounts(
  amounts: NutrientAmounts,
  multiplier: number,
): NutrientAmounts {
  finiteNonNegative(multiplier, 'Nutrient multiplier');
  const scaled: NutrientAmounts = {};
  for (const [code, value] of Object.entries(normalizeNutrientAmounts(amounts)) as Array<
    [NutrientCode, number]
  >) {
    scaled[code] = value * multiplier;
  }
  return scaled;
}

export function roundNutrientAmounts(
  amounts: NutrientAmounts,
  precisionByCode: Partial<Record<NutrientCode, number>> = {},
): NutrientAmounts {
  const rounded: NutrientAmounts = {};
  for (const [code, value] of Object.entries(normalizeNutrientAmounts(amounts)) as Array<
    [NutrientCode, number]
  >) {
    const definition = NUTRIENT_DEFINITIONS.find((item) => item.code === code);
    const precision = precisionByCode[code] ?? definition?.displayPrecision ?? 2;
    rounded[code] = Number(value.toFixed(precision));
  }
  return rounded;
}

export const ENERGY_FACTORS_KCAL_PER_GRAM = {
  protein: 4,
  carbohydrate: 4,
  totalFat: 9,
  alcohol: 7,
} as const;

export type EnergyResolution = {
  kcal: number | null;
  method: 'supplied' | 'macro-fallback' | 'unavailable';
  estimated: boolean;
  calculatedKcal: number | null;
  inconsistency: null | {
    differenceKcal: number;
    differencePercent: number;
    thresholdPercent: number;
  };
};

export function macroCalculatedEnergy(amounts: NutrientAmounts): number | null {
  const normalized = normalizeNutrientAmounts(amounts);
  const protein = normalized.protein;
  const carbohydrate = normalized.carbohydrate;
  const totalFat = normalized.total_fat;
  if (protein === undefined || carbohydrate === undefined || totalFat === undefined) return null;
  return (
    protein * ENERGY_FACTORS_KCAL_PER_GRAM.protein +
    carbohydrate * ENERGY_FACTORS_KCAL_PER_GRAM.carbohydrate +
    totalFat * ENERGY_FACTORS_KCAL_PER_GRAM.totalFat +
    (normalized.alcohol ?? 0) * ENERGY_FACTORS_KCAL_PER_GRAM.alcohol
  );
}

export function resolveEnergy(
  amounts: NutrientAmounts,
  options: { suppliedEnergyReliable?: boolean; inconsistencyThresholdPercent?: number } = {},
): EnergyResolution {
  const normalized = normalizeNutrientAmounts(amounts);
  const calculatedKcal = macroCalculatedEnergy(normalized);
  const supplied = normalized.energy_kcal;
  const thresholdPercent = options.inconsistencyThresholdPercent ?? 20;
  finiteNonNegative(thresholdPercent, 'Energy inconsistency threshold');
  const useSupplied = supplied !== undefined && options.suppliedEnergyReliable !== false;
  const kcal = useSupplied ? supplied : calculatedKcal;
  let inconsistency: EnergyResolution['inconsistency'] = null;
  if (useSupplied && calculatedKcal !== null && Math.max(supplied, calculatedKcal) > 0) {
    const differenceKcal = Math.abs(supplied - calculatedKcal);
    const differencePercent = (differenceKcal / Math.max(supplied, calculatedKcal)) * 100;
    if (differencePercent >= thresholdPercent) {
      inconsistency = { differenceKcal, differencePercent, thresholdPercent };
    }
  }
  return {
    kcal,
    method: useSupplied ? 'supplied' : calculatedKcal === null ? 'unavailable' : 'macro-fallback',
    estimated: !useSupplied && calculatedKcal !== null,
    calculatedKcal,
    inconsistency,
  };
}

export type MacroEnergyItem = {
  code: 'protein' | 'carbohydrate' | 'total_fat' | 'alcohol';
  grams: number;
  kcal: number;
  percentOfCalculatedEnergy: number;
};

export function macroEnergyDistribution(amounts: NutrientAmounts): {
  calculatedKcal: number;
  items: MacroEnergyItem[];
} | null {
  const normalized = normalizeNutrientAmounts(amounts);
  const factors: Array<[MacroEnergyItem['code'], number]> = [
    ['protein', ENERGY_FACTORS_KCAL_PER_GRAM.protein],
    ['carbohydrate', ENERGY_FACTORS_KCAL_PER_GRAM.carbohydrate],
    ['total_fat', ENERGY_FACTORS_KCAL_PER_GRAM.totalFat],
    ['alcohol', ENERGY_FACTORS_KCAL_PER_GRAM.alcohol],
  ];
  const itemsWithEnergy = factors.map(([code, factor]) => {
    const grams = normalized[code] ?? 0;
    return { code, grams, kcal: grams * factor };
  });
  if (
    normalized.protein === undefined ||
    normalized.carbohydrate === undefined ||
    normalized.total_fat === undefined
  ) {
    return null;
  }
  const calculatedKcal = itemsWithEnergy.reduce((sum, item) => sum + item.kcal, 0);
  return {
    calculatedKcal,
    items: itemsWithEnergy.map((item) => ({
      ...item,
      percentOfCalculatedEnergy: calculatedKcal === 0 ? 0 : (item.kcal / calculatedKcal) * 100,
    })),
  };
}

export type NutritionContribution = {
  id: string;
  amounts: NutrientAmounts;
  included?: boolean;
  optional?: boolean;
  amountMultiplier?: number;
  ediblePortion?: number;
  drainedYield?: number;
  retention?: Partial<Record<NutrientCode, number>>;
  confidence?: number;
  coverageWeight?: number;
};

export type RecipeNutritionCalculation = {
  amounts: NutrientAmounts;
  perNutrientCompleteness: Partial<Record<NutrientCode, number>>;
  completeness: number;
  confidence: number | null;
  includedContributionIds: string[];
  excludedContributionIds: string[];
};

export function aggregateRecipeNutrition(
  contributions: readonly NutritionContribution[],
  requiredNutrients: readonly NutrientCode[] = DEFAULT_DASHBOARD_NUTRIENTS,
): RecipeNutritionCalculation {
  const included = contributions.filter(
    (contribution) => contribution.included ?? !contribution.optional,
  );
  const excluded = contributions.filter(
    (contribution) => !(contribution.included ?? !contribution.optional),
  );
  const totalCoverageWeight = included.reduce((sum, contribution) => {
    const weight = contribution.coverageWeight ?? 1;
    return sum + finiteNonNegative(weight, `${contribution.id} coverage weight`);
  }, 0);
  const scaledAmounts: NutrientAmounts[] = [];
  const knownWeights: Partial<Record<NutrientCode, number>> = {};
  const nutrientConfidence: Partial<Record<NutrientCode, number>> = {};
  for (const contribution of included) {
    const amountMultiplier = contribution.amountMultiplier ?? 1;
    finiteNonNegative(amountMultiplier, `${contribution.id} amount multiplier`);
    const ediblePortion = fraction(
      contribution.ediblePortion ?? 1,
      `${contribution.id} edible portion`,
    );
    const drainedYield = fraction(
      contribution.drainedYield ?? 1,
      `${contribution.id} drained yield`,
    );
    const confidence = fraction(contribution.confidence ?? 1, `${contribution.id} confidence`);
    const weight = contribution.coverageWeight ?? 1;
    const amounts: NutrientAmounts = {};
    for (const [code, value] of Object.entries(
      normalizeNutrientAmounts(contribution.amounts),
    ) as Array<[NutrientCode, number]>) {
      const retention = fraction(
        contribution.retention?.[code] ?? 1,
        `${contribution.id} ${code} retention`,
      );
      amounts[code] = value * amountMultiplier * ediblePortion * drainedYield * retention;
      knownWeights[code] = (knownWeights[code] ?? 0) + weight;
      nutrientConfidence[code] = Math.min(nutrientConfidence[code] ?? 1, confidence);
    }
    scaledAmounts.push(amounts);
  }
  const perNutrientCompleteness: Partial<Record<NutrientCode, number>> = {};
  for (const code of requiredNutrients) {
    perNutrientCompleteness[code] =
      totalCoverageWeight === 0 ? 0 : Math.min(1, (knownWeights[code] ?? 0) / totalCoverageWeight);
  }
  const completeness = requiredNutrients.length
    ? requiredNutrients.reduce((sum, code) => sum + (perNutrientCompleteness[code] ?? 0), 0) /
      requiredNutrients.length
    : 1;
  const knownConfidences = requiredNutrients.flatMap((code) =>
    nutrientConfidence[code] === undefined ? [] : [nutrientConfidence[code]],
  );
  return {
    amounts: addNutrientAmounts(scaledAmounts),
    perNutrientCompleteness,
    completeness,
    confidence: knownConfidences.length ? Math.min(...knownConfidences) : null,
    includedContributionIds: included.map((contribution) => contribution.id),
    excludedContributionIds: excluded.map((contribution) => contribution.id),
  };
}

export function scaleRecipeNutrition(
  total: NutrientAmounts,
  options: {
    servings: number;
    finalWeightGrams?: number;
    selectedServings?: number;
    portionWeightGrams?: number;
  },
): {
  total: NutrientAmounts;
  perServing: NutrientAmounts;
  per100Grams: NutrientAmounts | null;
  selectedServings: NutrientAmounts | null;
  portion: NutrientAmounts | null;
} {
  if (!Number.isFinite(options.servings) || options.servings <= 0) {
    throw new Error('Recipe servings must be a finite positive number.');
  }
  const normalized = normalizeNutrientAmounts(total);
  const perServing = scaleNutrientAmounts(normalized, 1 / options.servings);
  const finalWeight = options.finalWeightGrams;
  if (finalWeight !== undefined && (!Number.isFinite(finalWeight) || finalWeight <= 0)) {
    throw new Error('Final recipe weight must be a finite positive number.');
  }
  const selectedServings = options.selectedServings;
  if (
    selectedServings !== undefined &&
    (!Number.isFinite(selectedServings) || selectedServings < 0)
  ) {
    throw new Error('Selected servings must be a finite non-negative number.');
  }
  const portionWeight = options.portionWeightGrams;
  if (portionWeight !== undefined && (!Number.isFinite(portionWeight) || portionWeight < 0)) {
    throw new Error('Portion weight must be a finite non-negative number.');
  }
  return {
    total: normalized,
    perServing,
    per100Grams:
      finalWeight === undefined ? null : scaleNutrientAmounts(normalized, 100 / finalWeight),
    selectedServings:
      selectedServings === undefined ? null : scaleNutrientAmounts(perServing, selectedServings),
    portion:
      finalWeight === undefined || portionWeight === undefined
        ? null
        : scaleNutrientAmounts(normalized, portionWeight / finalWeight),
  };
}

export type NutritionGoal =
  | { kind: 'target'; value: number }
  | { kind: 'minimum'; value: number }
  | { kind: 'range'; minimum: number; maximum: number }
  | { kind: 'limit'; maximum: number };

export type GoalEvaluation = {
  kind: NutritionGoal['kind'];
  amount: number;
  status: 'below' | 'within' | 'above' | 'met';
  coveragePercent: number | null;
  percentOfMinimum: number | null;
  percentOfMaximum: number | null;
  remaining: number | null;
  above: number;
};

export function evaluateNutritionGoal(amount: number, goal: NutritionGoal): GoalEvaluation {
  finiteNonNegative(amount, 'Consumed amount');
  if (goal.kind === 'target' || goal.kind === 'minimum') {
    if (!Number.isFinite(goal.value) || goal.value <= 0) {
      throw new Error('Target value must be a finite positive number.');
    }
    return {
      kind: goal.kind,
      amount,
      status: amount >= goal.value ? 'met' : 'below',
      coveragePercent: (amount / goal.value) * 100,
      percentOfMinimum: null,
      percentOfMaximum: null,
      remaining: Math.max(0, goal.value - amount),
      above: Math.max(0, amount - goal.value),
    };
  }
  if (goal.kind === 'range') {
    if (
      !Number.isFinite(goal.minimum) ||
      !Number.isFinite(goal.maximum) ||
      goal.minimum <= 0 ||
      goal.maximum < goal.minimum
    ) {
      throw new Error('Range bounds must be finite, positive, and ordered.');
    }
    return {
      kind: goal.kind,
      amount,
      status: amount < goal.minimum ? 'below' : amount > goal.maximum ? 'above' : 'within',
      coveragePercent: null,
      percentOfMinimum: (amount / goal.minimum) * 100,
      percentOfMaximum: (amount / goal.maximum) * 100,
      remaining: amount < goal.minimum ? goal.minimum - amount : 0,
      above: Math.max(0, amount - goal.maximum),
    };
  }
  if (!Number.isFinite(goal.maximum) || goal.maximum <= 0) {
    throw new Error('Limit maximum must be a finite positive number.');
  }
  return {
    kind: goal.kind,
    amount,
    status: amount > goal.maximum ? 'above' : 'within',
    coveragePercent: null,
    percentOfMinimum: null,
    percentOfMaximum: (amount / goal.maximum) * 100,
    remaining: Math.max(0, goal.maximum - amount),
    above: Math.max(0, amount - goal.maximum),
  };
}

export type DailyNutritionEntry = {
  kind: 'planned' | 'consumed';
  amounts: NutrientAmounts;
  completeness?: number;
  weight?: number;
};

function aggregateCompleteness(entries: readonly DailyNutritionEntry[]): number | null {
  if (!entries.length) return null;
  let totalWeight = 0;
  let weighted = 0;
  for (const entry of entries) {
    const weight = entry.weight ?? 1;
    finiteNonNegative(weight, 'Daily-entry completeness weight');
    const completeness = fraction(entry.completeness ?? 1, 'Daily-entry completeness');
    totalWeight += weight;
    weighted += completeness * weight;
  }
  return totalWeight === 0 ? null : weighted / totalWeight;
}

export function dailyNutritionTotals(entries: readonly DailyNutritionEntry[]): {
  consumed: NutrientAmounts;
  planned: NutrientAmounts;
  consumedCompleteness: number | null;
  plannedCompleteness: number | null;
} {
  const consumed = entries.filter((entry) => entry.kind === 'consumed');
  const planned = entries.filter((entry) => entry.kind === 'planned');
  return {
    consumed: addNutrientAmounts(consumed.map((entry) => entry.amounts)),
    planned: addNutrientAmounts(planned.map((entry) => entry.amounts)),
    consumedCompleteness: aggregateCompleteness(consumed),
    plannedCompleteness: aggregateCompleteness(planned),
  };
}

export type NutrientTrendPoint = {
  date: string;
  value: number | null;
  completeness: number | null;
};

export function nutrientTrend(
  days: readonly { date: string; amounts: NutrientAmounts | null; completeness?: number | null }[],
  code: NutrientCode,
): NutrientTrendPoint[] {
  return days.map((day) => ({
    date: day.date,
    value:
      day.amounts === null ? null : nutrientAmount(normalizeNutrientAmounts(day.amounts), code),
    completeness:
      day.completeness === undefined || day.completeness === null
        ? null
        : fraction(day.completeness, `${day.date} completeness`),
  }));
}

export function rollingAverage(
  points: readonly NutrientTrendPoint[],
  windowDays = 7,
): Array<NutrientTrendPoint & { rollingAverage: number | null; sampleDays: number }> {
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new Error('Rolling-average window must be a positive integer.');
  }
  return points.map((point, index) => {
    const available = points
      .slice(Math.max(0, index - windowDays + 1), index + 1)
      .flatMap((candidate) => (candidate.value === null ? [] : [candidate.value]));
    return {
      ...point,
      rollingAverage:
        available.length === 0
          ? null
          : available.reduce((sum, value) => sum + value, 0) / available.length,
      sampleDays: available.length,
    };
  });
}

export type HouseholdComparisonInput = {
  profileId: string;
  displayLabel: string;
  visibleInComparison: boolean;
  amount: number;
  goal: NutritionGoal;
  completeness: number;
};

export type HouseholdComparison = {
  profileId: string;
  displayLabel: string;
  semantic: 'coverage' | 'range-position' | 'limit-usage';
  normalizedPercent: number;
  status: GoalEvaluation['status'];
  completeness: number;
};

export function normalizedHouseholdComparisons(
  inputs: readonly HouseholdComparisonInput[],
): HouseholdComparison[] {
  return inputs
    .filter((input) => input.visibleInComparison)
    .map((input) => {
      const completeness = fraction(input.completeness, `${input.profileId} completeness`);
      const evaluation = evaluateNutritionGoal(input.amount, input.goal);
      if (input.goal.kind === 'range') {
        return {
          profileId: input.profileId,
          displayLabel: input.displayLabel,
          semantic: 'range-position',
          normalizedPercent: evaluation.percentOfMinimum ?? 0,
          status: evaluation.status,
          completeness,
        };
      }
      if (input.goal.kind === 'limit') {
        return {
          profileId: input.profileId,
          displayLabel: input.displayLabel,
          semantic: 'limit-usage',
          normalizedPercent: evaluation.percentOfMaximum ?? 0,
          status: evaluation.status,
          completeness,
        };
      }
      return {
        profileId: input.profileId,
        displayLabel: input.displayLabel,
        semantic: 'coverage',
        normalizedPercent: evaluation.coveragePercent ?? 0,
        status: evaluation.status,
        completeness,
      };
    });
}
