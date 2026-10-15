import { z } from 'zod';

export const bodyMetricFields = [
  {
    key: 'bodyFatPercent',
    label: 'Body fat',
    unit: '%',
    max: 100,
    help: 'Body fat percentage reported by your scale.',
  },
  {
    key: 'visceralFatIndex',
    label: 'Visceral fat',
    unit: 'index',
    max: 100,
    help: 'Use the scale’s index, not a percentage. Scales use different index ranges.',
  },
  {
    key: 'subcutaneousFatPercent',
    label: 'Subcutaneous fat',
    unit: '%',
    max: 100,
    help: 'Fat beneath the skin, as reported by your scale.',
  },
  {
    key: 'metabolicAgeYears',
    label: 'Metabolic age',
    unit: 'years',
    max: 150,
    help: 'A device estimate; this does not replace your actual age.',
  },
  {
    key: 'fatFreeWeightKilograms',
    label: 'Fat-free body weight',
    unit: 'kg',
    max: 1000,
    help: 'Body weight excluding fat.',
  },
  {
    key: 'bodyWaterPercent',
    label: 'Body water',
    unit: '%',
    max: 100,
    help: 'The scale’s estimate of water as a percentage of body weight.',
  },
  {
    key: 'skeletalMusclePercent',
    label: 'Skeletal muscle',
    unit: '%',
    max: 100,
    help: 'Enter a percentage only. Total muscle mass has a separate field below.',
  },
  {
    key: 'boneMassKilograms',
    label: 'Bone mass',
    unit: 'kg',
    max: 100,
    help: 'The scale’s estimated bone mass, not bone density.',
  },
  {
    key: 'proteinPercent',
    label: 'Protein',
    unit: '%',
    max: 100,
    help: 'Body composition percentage, not dietary protein intake.',
  },
  {
    key: 'muscleMassKilograms',
    label: 'Muscle mass',
    unit: 'kg',
    max: 1000,
    help: 'Total muscle mass reported by your scale.',
  },
  {
    key: 'bmrKilocalories',
    label: 'BMR',
    unit: 'kcal/day',
    max: 10000,
    help: 'Estimated energy used at rest. This is not a daily food target.',
  },
] as const;

const percentage = z.number().finite().min(0).max(100).nullable().optional();
const mass = z.number().finite().positive().max(1000).nullable().optional();
export const bodyMetricsSchema = z
  .object({
    bodyFatPercent: percentage,
    visceralFatIndex: z.number().finite().min(0).max(100).nullable().optional(),
    subcutaneousFatPercent: percentage,
    metabolicAgeYears: z.number().finite().positive().max(150).nullable().optional(),
    fatFreeWeightKilograms: mass,
    bodyWaterPercent: percentage,
    skeletalMusclePercent: percentage,
    boneMassKilograms: z.number().finite().positive().max(100).nullable().optional(),
    proteinPercent: percentage,
    muscleMassKilograms: mass,
    bmrKilocalories: z.number().finite().positive().max(10000).nullable().optional(),
  })
  .strict();
export type BodyMetrics = z.infer<typeof bodyMetricsSchema>;

export function bodyMetricsError(metrics: BodyMetrics, weight: number | null): string | null {
  const result = bodyMetricsSchema.safeParse(metrics);
  if (!result.success) return 'Check the advanced measurements and their units.';
  if (
    weight !== null &&
    ['fatFreeWeightKilograms', 'muscleMassKilograms', 'boneMassKilograms'].some((key) => {
      const value = metrics[key as keyof BodyMetrics];
      return value != null && value > weight;
    })
  )
    return 'A component of body mass cannot be greater than your total weight.';
  return null;
}
