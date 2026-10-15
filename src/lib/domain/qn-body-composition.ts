// TypeScript port of qn-scale-ble 0.0.1 BodyMetrics (MIT, Ron Ben Yosef).
// https://github.com/BHSPitMonkey/qn_scale_ble
// License: licenses/qn-scale-ble-MIT.txt. Preserve upstream rounding/clamps.
import { z } from 'zod';
import { bodyMetricsSchema, type BodyMetrics } from './body-metrics';
export const compositionEstimateSchema = z
  .object({
    method: z.literal('qn-scale-ble-0.0.1'),
    bmi: z.number().finite().positive(),
    metrics: bodyMetricsSchema,
  })
  .strict();
export type CompositionEstimate = z.infer<typeof compositionEstimateSchema>;
const inputs = z.object({
  weightKilograms: z.number().finite().positive().max(1000),
  heightMeters: z.number().finite().min(1).max(2.5),
  age: z.number().int().min(18).max(120),
  sex: z.enum(['male', 'female']),
  impedance: z.number().finite().positive().max(65535),
  athlete: z.boolean().default(false),
});
// Python round uses nearest-even on the exact binary float. Scaling with
// Math.round would change tie cases, including rounded intermediate masses.
export function pythonRound(value: number, digits: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(digits) || digits < 0 || digits > 6)
    throw new Error('Invalid rounding input');
  if (!value) return value;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, Math.abs(value));
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  let numerator =
    ((bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n)) * 10n ** BigInt(digits);
  const power = (exponent ? exponent - 1023 : -1022) - 52;
  let denominator = 1n;
  if (power >= 0) numerator <<= BigInt(power);
  else denominator <<= BigInt(-power);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n === 1n))
    rounded++;
  return (Math.sign(value) * Number(rounded)) / 10 ** digits;
}
export function calculateQnBodyComposition(
  raw: z.input<typeof inputs>,
): CompositionEstimate | null {
  const parsed = inputs.safeParse(raw);
  if (!parsed.success || parsed.data.athlete) return null;
  const { weightKilograms: w, heightMeters: h, age, sex, impedance } = parsed.data;
  const s = sex === 'male' ? 0 : 1;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const bmi = Math.floor((w / h ** 2) * 100) / 100;
  const fat = clamp(
    Math.floor(
      ([0.103, 0.097][s]! * age + [1.524, 1.545][s]! * bmi - 500 / impedance - [22, 12.7][s]!) * 10,
    ) / 10,
    5,
    75,
  );
  const lean = pythonRound(w * (1 - fat / 100), 2);
  const visceral = clamp(
    Math.trunc(
      [0.8666, 0.8895][s]! * bmi +
        [0.0082, 0.0943][s]! * fat +
        [0.026, -0.0534][s]! * (w - lean) -
        [14.2692, 16.215][s]!,
    ),
    1,
    30,
  );
  const portion = Math.max(1, [0.05, 0.06][s]! * lean);
  const water = clamp(pythonRound((([0.76, 0.73][s]! * (lean - portion)) / w) * 100, 1), 10, 80);
  const bone = Math.max(1, pythonRound([0.05, 0.06][s]! * lean, 2));
  const reference = [0.7, 0.45][s]! * ([100, 137][s]! * h - [80, 110][s]!);
  let weightScore = 0;
  if (reference <= w)
    weightScore =
      reference * 1.3 < w ? 50 : Math.trunc(100 - (50 * (w - reference)) / (0.3 * reference));
  else if (reference * 0.7 < w)
    weightScore = Math.trunc(100 - (50 * (reference - w)) / (0.3 * reference));
  else
    for (let x = 0; x < 6; x++) {
      if ((reference * x) / 10 > w) {
        weightScore = x * 10;
        break;
      }
    }
  const fatReference = [16, 26][s]!;
  const fatScore =
    fatReference < fat
      ? fat >= 45
        ? 50
        : Math.trunc(100 - (50 * (fat - fatReference)) / (45 - fatReference))
      : Math.trunc(100 - (50 * (fatReference - fat)) / (fatReference - 5));
  const bmiScore =
    bmi >= 22
      ? bmi >= 35
        ? 50
        : Math.trunc(100 - 3.85 * (bmi - 22))
      : bmi >= 15
        ? Math.trunc(100 - 3.85 * (22 - bmi))
        : bmi >= 10
          ? 40
          : bmi >= 5
            ? 30
            : 20;
  const score = Math.floor((weightScore + fatScore + bmiScore) / 3);
  const thresholds = [50, 60, 65, 68, 70, 73, 75, 80, 85, 88, 90, 93, 95, 97, 98, 99];
  const found = thresholds.findIndex((limit) => score < limit);
  const adjustment = found < 0 ? 16 : found;
  const metrics: BodyMetrics = {
    bodyFatPercent: fat,
    visceralFatIndex: visceral,
    subcutaneousFatPercent: pythonRound([0.965, 0.983][s]! * fat - [0.22, 0.303][s]! * visceral, 1),
    metabolicAgeYears: Math.max(18, age + 8 - adjustment),
    fatFreeWeightKilograms: lean,
    bodyWaterPercent: water,
    skeletalMusclePercent: pythonRound((([0.68, 0.62][s]! * (lean - portion)) / w) * 100, 1),
    boneMassKilograms: bone,
    proteinPercent: Math.max(
      5,
      pythonRound(100 - [1, 1.05][s]! * fat - (bone / w) * 100 - water, 1),
    ),
    muscleMassKilograms: pythonRound(lean - portion, 2),
    bmrKilocalories: clamp(Math.trunc(lean * 21.6 + 370), 900, 2500),
  };
  const result = compositionEstimateSchema.safeParse({
    method: 'qn-scale-ble-0.0.1',
    bmi,
    metrics,
  });
  return result.success ? result.data : null;
}
export function parseCompositionEstimate(
  value: string | null | undefined,
): CompositionEstimate | null {
  if (!value) return null;
  try {
    const result = compositionEstimateSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
