import { NUTRIENT_DEFINITIONS, type NutrientCode } from '@/lib/domain/nutrition';

const conciseCodes = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'total_fat',
  'fiber',
  'sodium',
] as const;

type CalculationInput = {
  id: string;
  recipeRevision: number;
  revision: number;
  servingCount: number | null;
  confidence: number;
  completeness: number;
  createdAt: Date;
  source: { name: string; provider: string; version: string };
  calculationVersion: { algorithm: string; version: string; energyFactorsVersion: string };
  values: Array<{
    nutrientCode: string;
    amount: number;
    confidence: number | null;
    completeness: number | null;
  }>;
  notes: string;
};

export type RecipeNutritionPresentation = {
  status: 'unavailable' | 'current' | 'stale';
  calculationId: string | null;
  recipeRevision: number | null;
  calculationRevision: number | null;
  servingCount: number | null;
  confidence: number | null;
  completeness: number | null;
  sourceLabel: string;
  methodLabel: string;
  energyMethod: string;
  warnings: string[];
  calculatedAt: string | null;
  values: Array<{
    nutrientCode: NutrientCode;
    label: string;
    unit: string;
    total: number;
    perServing: number | null;
    confidence: number;
    completeness: number;
  }>;
};

export function presentRecipeNutrition(
  currentRecipeRevision: number,
  calculation: CalculationInput | null,
): RecipeNutritionPresentation {
  if (!calculation) {
    return {
      status: 'unavailable',
      calculationId: null,
      recipeRevision: null,
      calculationRevision: null,
      servingCount: null,
      confidence: null,
      completeness: null,
      sourceLabel: '',
      methodLabel: '',
      energyMethod: 'unavailable',
      warnings: ['No normalized ingredient calculation is available.'],
      calculatedAt: null,
      values: [],
    };
  }
  let energyMethod = 'supplied';
  let warnings: string[] = [];
  try {
    const notes = JSON.parse(calculation.notes) as { energyMethod?: string; warnings?: string[] };
    energyMethod = notes.energyMethod ?? energyMethod;
    warnings = notes.warnings ?? warnings;
  } catch {
    warnings = calculation.notes ? [calculation.notes] : [];
  }
  const stale = calculation.recipeRevision !== currentRecipeRevision;
  if (stale) {
    warnings = [
      `This calculation covers recipe revision ${calculation.recipeRevision}, not current revision ${currentRecipeRevision}.`,
      ...warnings,
    ];
  }
  const values = calculation.values.flatMap((value) => {
    if (!conciseCodes.includes(value.nutrientCode as (typeof conciseCodes)[number])) return [];
    const definition = NUTRIENT_DEFINITIONS.find((item) => item.code === value.nutrientCode);
    if (!definition) return [];
    return [
      {
        nutrientCode: value.nutrientCode as NutrientCode,
        label: definition.displayName,
        unit: definition.canonicalUnit,
        total: value.amount,
        perServing: calculation.servingCount ? value.amount / calculation.servingCount : null,
        confidence: value.confidence ?? calculation.confidence,
        completeness: value.completeness ?? calculation.completeness,
      },
    ];
  });
  return {
    status: stale ? 'stale' : 'current',
    calculationId: calculation.id,
    recipeRevision: calculation.recipeRevision,
    calculationRevision: calculation.revision,
    servingCount: calculation.servingCount,
    confidence: calculation.confidence,
    completeness: calculation.completeness,
    sourceLabel: [calculation.source.name, calculation.source.version].filter(Boolean).join(' · '),
    methodLabel: [
      calculation.calculationVersion.algorithm,
      `v${calculation.calculationVersion.version}`,
      calculation.calculationVersion.energyFactorsVersion,
    ]
      .filter(Boolean)
      .join(' · '),
    energyMethod,
    warnings: [...new Set(warnings)],
    calculatedAt: calculation.createdAt.toISOString(),
    values,
  };
}
