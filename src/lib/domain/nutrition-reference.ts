import { z } from 'zod';

import { NUTRIENT_CODES, type NutrientCode, type NutrientSemantic } from '@/lib/domain/nutrition';

export const REFERENCE_NUTRIENT_GAPS = [
  'chloride',
  'chromium',
  'molybdenum',
  'niacin_equivalents',
] as const;

export type ReferenceNutrientGap = (typeof REFERENCE_NUTRIENT_GAPS)[number];
export type ReferenceNutrientCode = NutrientCode | ReferenceNutrientGap;

const referenceNutrientCodes = [...NUTRIENT_CODES, ...REFERENCE_NUTRIENT_GAPS] as const;
const referenceNutrientCodeSchema = z.enum(referenceNutrientCodes);
const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const isoDateSchema = z.iso.date();

export const NUTRITION_GENERAL_DISCLAIMER =
  'For general nutrition information, not medical advice. Reference values describe healthy population groups; individual needs may differ.';

export const nutritionReferenceSourceSchema = z
  .object({
    id: requiredText(160),
    publisher: requiredText(200),
    title: requiredText(300),
    url: z.url().max(2_000),
    version: requiredText(160),
    publishedOn: isoDateSchema.nullable(),
    updatedOn: isoDateSchema.nullable(),
    retrievedOn: isoDateSchema,
    citation: requiredText(1_000),
  })
  .strict();

export const nutritionReferenceApplicabilitySchema = z
  .object({
    lifeStage: requiredText(120),
    minimumAgeMonths: z.number().int().min(0).max(1_800).nullable(),
    maximumAgeMonths: z.number().int().min(0).max(1_800).nullable(),
    sex: z.enum(['all', 'female', 'male']),
    pregnancy: z.enum(['excluded', 'included', 'required']),
    lactation: z.enum(['excluded', 'included', 'required']),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minimumAgeMonths !== null &&
      value.maximumAgeMonths !== null &&
      value.maximumAgeMonths < value.minimumAgeMonths
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximumAgeMonths'],
        message: 'Maximum age must not be lower than minimum age.',
      });
    }
    if (value.pregnancy === 'required' && value.lactation === 'required') {
      context.addIssue({
        code: 'custom',
        path: ['lactation'],
        message: 'Pregnancy and lactation cannot both be required.',
      });
    }
  });

const referenceValueSchema = z.union([
  z
    .object({
      form: z.literal('amount'),
      amount: z.number().finite().nonnegative(),
      unit: requiredText(40),
    })
    .strict(),
  z
    .object({
      form: z.literal('range'),
      minimum: z.number().finite().nonnegative(),
      maximum: z.number().finite().nonnegative(),
      unit: requiredText(40),
    })
    .strict()
    .refine((value) => value.maximum >= value.minimum, {
      path: ['maximum'],
      message: 'Range maximum must not be lower than minimum.',
    }),
  z
    .object({
      form: z.literal('percent_energy_range'),
      minimumPercent: z.number().finite().min(0).max(100),
      maximumPercent: z.number().finite().min(0).max(100),
    })
    .strict()
    .refine((value) => value.maximumPercent >= value.minimumPercent, {
      path: ['maximumPercent'],
      message: 'Percent maximum must not be lower than minimum.',
    }),
  z.object({ form: z.literal('not_established'), reason: requiredText(500) }).strict(),
]);

export const nutritionReferenceRowSchema = z
  .object({
    nutrientCode: referenceNutrientCodeSchema,
    referenceKind: z.enum(['daily_value', 'rda', 'ai', 'ear', 'ul', 'amdr', 'cdrr']),
    semantic: z.enum(['target', 'minimum', 'range', 'limit', 'informational']),
    value: referenceValueSchema,
    upperLimitScope: z.enum([
      'not_applicable',
      'all_intake',
      'food_only',
      'supplements_and_fortified_food',
      'source_footnote_required',
    ]),
    note: boundedText(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.referenceKind === 'ul' && value.semantic !== 'limit') {
      context.addIssue({ code: 'custom', path: ['semantic'], message: 'A UL is a limit.' });
    }
    if (value.referenceKind !== 'ul' && value.upperLimitScope !== 'not_applicable') {
      context.addIssue({
        code: 'custom',
        path: ['upperLimitScope'],
        message: 'Upper-limit source scope applies only to UL rows.',
      });
    }
    if (value.referenceKind === 'amdr' && value.value.form !== 'percent_energy_range') {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'An AMDR must be a percent-of-energy range.',
      });
    }
  });

export const nutritionReferenceSetSchema = z
  .object({
    id: requiredText(160),
    referenceSystem: z.enum(['fda_daily_value', 'dietary_reference_intake']),
    purpose: z.enum(['label_reference', 'individual_planning', 'group_assessment', 'upper_limit']),
    label: requiredText(240),
    source: nutritionReferenceSourceSchema,
    applicability: nutritionReferenceApplicabilitySchema,
    rows: z.array(nutritionReferenceRowSchema).min(1).max(200),
    disclaimer: requiredText(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, row] of value.rows.entries()) {
      const key = `${row.nutrientCode}:${row.referenceKind}`;
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['rows', index, 'nutrientCode'],
          message: `Duplicate reference row ${key}.`,
        });
      }
      seen.add(key);
    }
    if (
      value.referenceSystem === 'fda_daily_value' &&
      (value.purpose !== 'label_reference' ||
        value.rows.some((row) => row.referenceKind !== 'daily_value'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['purpose'],
        message: 'FDA Daily Values must remain label-reference daily values.',
      });
    }
  });

export type NutritionReferenceSet = z.infer<typeof nutritionReferenceSetSchema>;
export type NutritionReferenceRow = z.infer<typeof nutritionReferenceRowSchema>;

const fdaDailyValue = (
  nutrientCode: ReferenceNutrientCode,
  amount: number,
  unit: string,
  semantic: NutrientSemantic,
): NutritionReferenceRow => ({
  nutrientCode,
  referenceKind: 'daily_value',
  semantic,
  value: { form: 'amount', amount, unit },
  upperLimitScope: 'not_applicable',
  note: 'General FDA label reference; not a personalized DRI.',
});

export const FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS = nutritionReferenceSetSchema.parse({
  id: 'fda-daily-values-adults-children-4-plus-retrieved-2026-07-18',
  referenceSystem: 'fda_daily_value',
  purpose: 'label_reference',
  label: 'FDA Daily Values — adults and children 4 years and older',
  source: {
    id: 'fda-daily-value-reference-guide-2026-07-18',
    publisher: 'U.S. Food and Drug Administration',
    title: 'Daily Value on the Nutrition and Supplement Facts Labels',
    url: 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels',
    version: 'current page retrieved 2026-07-18; regulatory authority 21 CFR 101.9',
    publishedOn: null,
    updatedOn: null,
    retrievedOn: '2026-07-18',
    citation:
      'U.S. Food and Drug Administration. Daily Value on the Nutrition and Supplement Facts Labels. Accessed 2026-07-18.',
  },
  applicability: {
    lifeStage: 'adults and children 4 years and older; general food-label reference',
    minimumAgeMonths: 48,
    maximumAgeMonths: null,
    sex: 'all',
    pregnancy: 'excluded',
    lactation: 'excluded',
  },
  rows: [
    fdaDailyValue('added_sugars', 50, 'g', 'limit'),
    fdaDailyValue('biotin', 30, 'mcg', 'target'),
    fdaDailyValue('calcium', 1_300, 'mg', 'target'),
    fdaDailyValue('chloride', 2_300, 'mg', 'target'),
    fdaDailyValue('choline', 550, 'mg', 'target'),
    fdaDailyValue('cholesterol', 300, 'mg', 'limit'),
    fdaDailyValue('chromium', 35, 'mcg', 'target'),
    fdaDailyValue('copper', 0.9, 'mg', 'target'),
    fdaDailyValue('fiber', 28, 'g', 'minimum'),
    fdaDailyValue('total_fat', 78, 'g', 'target'),
    fdaDailyValue('folate', 400, 'mcg DFE', 'target'),
    fdaDailyValue('iodine', 150, 'mcg', 'target'),
    fdaDailyValue('iron', 18, 'mg', 'target'),
    fdaDailyValue('magnesium', 420, 'mg', 'target'),
    fdaDailyValue('manganese', 2.3, 'mg', 'target'),
    fdaDailyValue('molybdenum', 45, 'mcg', 'target'),
    fdaDailyValue('niacin_equivalents', 16, 'mg NE', 'target'),
    fdaDailyValue('pantothenic_acid', 5, 'mg', 'target'),
    fdaDailyValue('phosphorus', 1_250, 'mg', 'target'),
    fdaDailyValue('potassium', 4_700, 'mg', 'minimum'),
    fdaDailyValue('protein', 50, 'g', 'minimum'),
    fdaDailyValue('riboflavin', 1.3, 'mg', 'target'),
    fdaDailyValue('saturated_fat', 20, 'g', 'limit'),
    fdaDailyValue('selenium', 55, 'mcg', 'target'),
    fdaDailyValue('sodium', 2_300, 'mg', 'limit'),
    fdaDailyValue('thiamin', 1.2, 'mg', 'target'),
    fdaDailyValue('carbohydrate', 275, 'g', 'target'),
    fdaDailyValue('vitamin_a', 900, 'mcg RAE', 'target'),
    fdaDailyValue('vitamin_b6', 1.7, 'mg', 'target'),
    fdaDailyValue('vitamin_b12', 2.4, 'mcg', 'target'),
    fdaDailyValue('vitamin_c', 90, 'mg', 'target'),
    fdaDailyValue('vitamin_d', 20, 'mcg', 'target'),
    fdaDailyValue('vitamin_e', 15, 'mg alpha-tocopherol', 'target'),
    fdaDailyValue('vitamin_k', 120, 'mcg', 'target'),
    fdaDailyValue('zinc', 11, 'mg', 'target'),
  ],
  disclaimer: NUTRITION_GENERAL_DISCLAIMER,
});

export type ReferenceProfileContext = {
  ageMonths: number;
  sex: 'female' | 'male';
  pregnant: boolean;
  lactating: boolean;
};

export function referenceAppliesToProfile(
  applicability: z.infer<typeof nutritionReferenceApplicabilitySchema>,
  profile: ReferenceProfileContext,
): boolean {
  if (!Number.isInteger(profile.ageMonths) || profile.ageMonths < 0) return false;
  if (applicability.minimumAgeMonths !== null && profile.ageMonths < applicability.minimumAgeMonths)
    return false;
  if (applicability.maximumAgeMonths !== null && profile.ageMonths > applicability.maximumAgeMonths)
    return false;
  if (applicability.sex !== 'all' && applicability.sex !== profile.sex) return false;
  if (applicability.pregnancy === 'required' && !profile.pregnant) return false;
  if (applicability.pregnancy === 'excluded' && profile.pregnant) return false;
  if (applicability.lactation === 'required' && !profile.lactating) return false;
  if (applicability.lactation === 'excluded' && profile.lactating) return false;
  return true;
}

export function canonicalReferenceGaps(
  referenceSet: NutritionReferenceSet,
): ReferenceNutrientGap[] {
  const canonical = new Set<string>(NUTRIENT_CODES);
  return [...new Set(referenceSet.rows.map((row) => row.nutrientCode))].filter(
    (code): code is ReferenceNutrientGap => !canonical.has(code),
  );
}

export function referenceDisclosure(referenceSet: NutritionReferenceSet): string {
  const applicability = referenceSet.applicability.lifeStage;
  return `${referenceSet.label}. ${applicability}. Source: ${referenceSet.source.publisher}, ${referenceSet.source.version}. ${referenceSet.disclaimer}`;
}

export type EstimatedEnergyDisclosure = {
  status: 'unavailable' | 'estimated';
  label: string;
  explanation: string;
};

export function estimatedEnergyDisclosure(input: {
  consented: boolean;
  requiredInputsComplete: boolean;
  method?: string;
  sourceVersion?: string;
}): EstimatedEnergyDisclosure {
  if (!input.consented) {
    return {
      status: 'unavailable',
      label: 'Energy target not estimated',
      explanation: 'Estimation requires explicit consent; a manual target may be used instead.',
    };
  }
  if (!input.requiredInputsComplete) {
    return {
      status: 'unavailable',
      label: 'Energy target not estimated',
      explanation: 'Required age, body, and activity inputs are incomplete.',
    };
  }
  return {
    status: 'estimated',
    label: 'Estimated energy target',
    explanation: `Estimate using ${input.method ?? 'a documented method'} (${input.sourceVersion ?? 'version not recorded'}). Individual needs may differ.`,
  };
}
