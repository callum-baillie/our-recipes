export const MAX_KITCHEN_MEASUREMENTS = 16;
/** Input guidance shared by web/native. These are units and field choices, never owned facts. */
export const KITCHEN_MEASUREMENT_UNITS = [
  'ml',
  'l',
  'us-qt',
  'imperial-qt',
  'cm',
  'mm',
  'in',
  'g',
  'kg',
  'slices',
  'device-cups',
] as const;
export const KITCHEN_MEASUREMENT_BASES = [
  'nominal-volume',
  'working-liquid',
  'dry-input',
  'cooked-output',
  'food-mass',
  'diameter',
  'depth',
  'width',
  'height',
  'length',
  'slices-per-cycle',
] as const;
export type MeasurementUnit = (typeof KITCHEN_MEASUREMENT_UNITS)[number];
export type MeasurementBasis = (typeof KITCHEN_MEASUREMENT_BASES)[number];
export type MeasurementKind = 'volume' | 'diameter' | 'dimensions' | 'slots' | null;
export const MEASUREMENT_UNIT_LABELS: Record<MeasurementUnit, string> = {
  ml: 'mL',
  l: 'L',
  'us-qt': 'US liquid quarts',
  'imperial-qt': 'Imperial quarts',
  cm: 'cm',
  mm: 'mm',
  in: 'inches',
  g: 'g',
  kg: 'kg',
  slices: 'slices',
  'device-cups': 'Device rice cups',
};
export const MEASUREMENT_BASIS_LABELS: Record<MeasurementBasis, string> = {
  'nominal-volume': 'Nominal vessel volume',
  'working-liquid': 'Working liquid limit',
  'dry-input': 'Dry input capacity',
  'cooked-output': 'Cooked output capacity',
  'food-mass': 'Food mass capacity',
  diameter: 'Pan diameter',
  depth: 'Useful internal depth',
  width: 'Usable internal width',
  height: 'Usable internal height',
  length: 'Usable internal length',
  'slices-per-cycle': 'Slices per cycle',
};
export function measurementUnitsFor(basis: string): readonly MeasurementUnit[] {
  if (['diameter', 'depth', 'width', 'height', 'length'].includes(basis)) return ['cm', 'mm', 'in'];
  if (basis === 'food-mass') return ['g', 'kg'];
  if (basis === 'slices-per-cycle') return ['slices'];
  return [
    'ml',
    'l',
    'us-qt',
    'imperial-qt',
    ...(basis === 'dry-input' ? ['device-cups' as const] : []),
  ];
}
export function measurementBasesFor(
  kind: MeasurementKind,
  custom = false,
): readonly MeasurementBasis[] {
  if (custom) return KITCHEN_MEASUREMENT_BASES;
  if (kind === 'diameter') return ['diameter', 'depth'];
  if (kind === 'dimensions') return ['width', 'height', 'depth', 'length'];
  if (kind === 'slots') return ['slices-per-cycle'];
  if (kind === 'volume')
    return [
      'nominal-volume',
      'working-liquid',
      'dry-input',
      'cooked-output',
      'food-mass',
      'diameter',
      'depth',
    ];
  return [];
}
export function starterMeasurement(kind: MeasurementKind, custom = false) {
  const basis = measurementBasesFor(kind, custom)[0] ?? 'nominal-volume';
  return {
    value: 0,
    basis,
    unit: measurementUnitsFor(basis)[0]!,
    provenance: 'user-confirmed' as const,
  };
}

export function validateMeasurementDrafts(
  values: { value: number; basis: string; unit: MeasurementUnit; deviceCupMl?: number }[],
) {
  for (const [i, value] of values.entries()) {
    const label = `Measurement ${i + 1}`;
    if (!Number.isFinite(value.value) || value.value <= 0 || value.value > 100000)
      throw new Error(`${label}: enter a positive value, or remove it for Not sure.`);
    if (!measurementUnitsFor(value.basis).includes(value.unit))
      throw new Error(`${label}: choose a unit matching the measurement basis.`);
    if (
      value.unit === 'device-cups' &&
      (!value.deviceCupMl || value.deviceCupMl <= 0 || value.deviceCupMl > 1000)
    )
      throw new Error(`${label}: record the device measuring cup volume in mL.`);
    if (value.basis === 'slices-per-cycle' && !Number.isInteger(value.value))
      throw new Error(`${label}: enter a whole number of slices per cycle.`);
  }
}
