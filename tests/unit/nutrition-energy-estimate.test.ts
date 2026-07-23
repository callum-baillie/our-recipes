import { describe, expect, it } from 'vitest';

import {
  completedAgeOn,
  estimateAdultEnergy,
  nutritionEnergyEstimateRequestSchema,
} from '@/lib/domain/nutrition-energy-estimate';

describe('NASEM 2023 adult energy estimates', () => {
  it('implements all eight Table 5-16 equations exactly', () => {
    const age = 30;
    const height = 170;
    const weight = 70;
    const cases = [
      ['male', 'inactive', 753.07 - 10.83 * age + 6.5 * height + 14.1 * weight],
      ['male', 'low_active', 581.47 - 10.83 * age + 8.3 * height + 14.94 * weight],
      ['male', 'active', 1004.82 - 10.83 * age + 6.52 * height + 15.91 * weight],
      ['male', 'very_active', -517.88 - 10.83 * age + 15.61 * height + 19.11 * weight],
      ['female', 'inactive', 584.9 - 7.01 * age + 5.72 * height + 11.71 * weight],
      ['female', 'low_active', 575.77 - 7.01 * age + 6.6 * height + 12.14 * weight],
      ['female', 'active', 710.25 - 7.01 * age + 6.54 * height + 12.34 * weight],
      ['female', 'very_active', 511.83 - 7.01 * age + 9.07 * height + 12.56 * weight],
    ] as const;
    for (const [sex, pal, expected] of cases) {
      const result = estimateAdultEnergy({
        dateOfBirth: '1996-01-01',
        effectiveOn: '2026-07-19',
        heightCentimeters: height,
        currentWeightKilograms: weight,
        referenceSexCategory: sex,
        palCategory: pal,
      });
      expect(result.exactKcal).toBeCloseTo(expected, 8);
      expect(result.roundedKcal).toBe(Math.round(expected));
      expect(result.sourceId).toBe('nasem-eer-2023-table-5-16');
    }
  });

  it('uses completed age and excludes unsupported people and invalid values', () => {
    expect(completedAgeOn('2007-07-20', '2026-07-19')).toBe(18);
    expect(completedAgeOn('2007-07-19', '2026-07-19')).toBe(19);
    expect(() =>
      estimateAdultEnergy({
        dateOfBirth: '2007-07-20',
        effectiveOn: '2026-07-19',
        heightCentimeters: 170,
        currentWeightKilograms: 70,
        referenceSexCategory: 'female',
        palCategory: 'inactive',
      }),
    ).toThrow(/19 and older/iu);
    expect(() =>
      estimateAdultEnergy({
        dateOfBirth: '1990-01-01',
        effectiveOn: '2026-07-19',
        heightCentimeters: Number.NaN,
        currentWeightKilograms: 70,
        referenceSexCategory: 'female',
        palCategory: 'inactive',
      }),
    ).toThrow(/finite positive/iu);
  });

  it('requires a strict fresh PAL category and operation details for apply', () => {
    expect(
      nutritionEnergyEstimateRequestSchema.safeParse({
        action: 'preview',
        expectedProfileVersion: 1,
        effectiveOn: '2026-07-19',
        palCategory: 'moderate',
      }).success,
    ).toBe(false);
    expect(
      nutritionEnergyEstimateRequestSchema.safeParse({
        action: 'apply',
        expectedProfileVersion: 1,
        effectiveOn: '2026-07-19',
        palCategory: 'active',
      }).success,
    ).toBe(false);
  });
});
