// Mirrored from the web domain; contract tests detect drift.
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
export function parseBodyMetrics(values: Record<string, string>, weightKilograms: number) {
  const metrics: Record<string, number> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!raw.trim()) continue;
    const field = bodyMetricFields.find((item) => item.key === key);
    const amount = Number(raw);
    const zeroAllowed = key.endsWith('Percent') || key === 'visceralFatIndex';
    if (
      !field ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      (!zeroAllowed && amount === 0) ||
      amount > field.max
    )
      throw new Error(`Check ${field?.label ?? key} and its units.`);
    if (key.endsWith('Kilograms') && amount > weightKilograms)
      throw new Error('A body component cannot exceed total body weight.');
    metrics[key] = amount;
  }
  return metrics;
}
