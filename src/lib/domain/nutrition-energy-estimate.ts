import { z } from 'zod';

export const NASEM_EER_SOURCE_ID = 'nasem-eer-2023-table-5-16';
export const NASEM_EER_DOI = '10.17226/26818';
export const NASEM_EER_SOURCE_URL = 'https://www.nationalacademies.org/read/26818/chapter/7';

export const adultPalCategorySchema = z.enum(['inactive', 'low_active', 'active', 'very_active']);

export const nutritionEnergyEstimateRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      expectedProfileVersion: z.number().int().positive(),
      effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      palCategory: adultPalCategorySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      expectedProfileVersion: z.number().int().positive(),
      effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      palCategory: adultPalCategorySchema,
      operationId: z.string().uuid(),
      supersedesGoalVersionId: z.string().uuid().nullable().default(null),
    })
    .strict(),
]);

export type AdultPalCategory = z.infer<typeof adultPalCategorySchema>;
export type NutritionEnergyEstimateRequest = z.infer<typeof nutritionEnergyEstimateRequestSchema>;

type Coefficients = { intercept: number; age: number; height: number; weight: number };

const COEFFICIENTS: Record<'male' | 'female', Record<AdultPalCategory, Coefficients>> = {
  male: {
    inactive: { intercept: 753.07, age: -10.83, height: 6.5, weight: 14.1 },
    low_active: { intercept: 581.47, age: -10.83, height: 8.3, weight: 14.94 },
    active: { intercept: 1004.82, age: -10.83, height: 6.52, weight: 15.91 },
    very_active: { intercept: -517.88, age: -10.83, height: 15.61, weight: 19.11 },
  },
  female: {
    inactive: { intercept: 584.9, age: -7.01, height: 5.72, weight: 11.71 },
    low_active: { intercept: 575.77, age: -7.01, height: 6.6, weight: 12.14 },
    active: { intercept: 710.25, age: -7.01, height: 6.54, weight: 12.34 },
    very_active: { intercept: 511.83, age: -7.01, height: 9.07, weight: 12.56 },
  },
};

export class NutritionEnergyEstimateUnavailableError extends Error {}

export function completedAgeOn(dateOfBirth: string, effectiveOn: string) {
  const birth = new Date(`${dateOfBirth}T12:00:00Z`);
  const effective = new Date(`${effectiveOn}T12:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(effective.getTime()) || effective < birth)
    throw new NutritionEnergyEstimateUnavailableError(
      'A valid effective date after birth is required.',
    );
  let age = effective.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed =
    effective.getUTCMonth() > birth.getUTCMonth() ||
    (effective.getUTCMonth() === birth.getUTCMonth() &&
      effective.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

export function estimateAdultEnergy(input: {
  dateOfBirth: string;
  effectiveOn: string;
  heightCentimeters: number;
  currentWeightKilograms: number;
  referenceSexCategory: 'female' | 'male';
  palCategory: AdultPalCategory;
}) {
  const ageYears = completedAgeOn(input.dateOfBirth, input.effectiveOn);
  if (ageYears < 19)
    throw new NutritionEnergyEstimateUnavailableError(
      'This initial estimate supports adults age 19 and older only.',
    );
  if (
    !Number.isFinite(input.heightCentimeters) ||
    input.heightCentimeters <= 0 ||
    !Number.isFinite(input.currentWeightKilograms) ||
    input.currentWeightKilograms <= 0
  )
    throw new NutritionEnergyEstimateUnavailableError(
      'A finite positive height and current weight are required.',
    );
  const coefficients = COEFFICIENTS[input.referenceSexCategory][input.palCategory];
  const exactKcal =
    coefficients.intercept +
    coefficients.age * ageYears +
    coefficients.height * input.heightCentimeters +
    coefficients.weight * input.currentWeightKilograms;
  if (!Number.isFinite(exactKcal) || exactKcal <= 0)
    throw new NutritionEnergyEstimateUnavailableError(
      'The selected equation did not yield a usable estimate.',
    );
  return {
    sourceId: NASEM_EER_SOURCE_ID,
    sourceVersion: 'NASEM Dietary Reference Intakes for Energy (2023), Table 5-16',
    sourceUrl: NASEM_EER_SOURCE_URL,
    doi: NASEM_EER_DOI,
    referenceSexCategory: input.referenceSexCategory,
    palCategory: input.palCategory,
    effectiveOn: input.effectiveOn,
    ageYears,
    heightCentimeters: input.heightCentimeters,
    currentWeightKilograms: input.currentWeightKilograms,
    exactKcal,
    roundedKcal: Math.round(exactKcal),
    unit: 'kcal/day' as const,
    formula: `${coefficients.intercept} + (${coefficients.age} × age) + (${coefficients.height} × height_cm) + (${coefficients.weight} × weight_kg)`,
    disclosure:
      'Estimated weight-maintenance energy from NASEM 2023. Physical-activity classification and individual requirements are uncertain; this is general nutrition information, not medical advice or a weight-loss prescription.',
  };
}
