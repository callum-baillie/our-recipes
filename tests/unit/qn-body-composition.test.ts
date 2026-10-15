import { describe, expect, it } from 'vitest';
import {
  calculateQnBodyComposition,
  pythonRound,
  parseCompositionEstimate,
} from '@/lib/domain/qn-body-composition';
import { parseVeSyncReadings } from '@/lib/providers/vesync-scale';
import fixtures from './qn-body-composition-fixtures.json';
describe('qn-scale-ble 0.0.1 calculations', () => {
  it.each(fixtures)(
    'matches upstream Python for $input.sex, $input.weightKilograms kg',
    ({ input, expected }) => {
      expect(calculateQnBodyComposition({ ...input, sex: input.sex as 'male' | 'female' })).toEqual(
        expected,
      );
    },
  );
  it('preserves Python rounding', () => {
    expect(pythonRound(2.675, 2)).toBe(2.67);
    expect(pythonRound(1.25, 1)).toBe(1.2);
    expect(pythonRound(-1.25, 1)).toBe(-1.2);
    expect(pythonRound(1.35, 1)).toBe(1.4);
  });
  it('rejects incomplete or unsupported inputs', () => {
    const input = {
      weightKilograms: 80,
      heightMeters: 1.8,
      age: 30,
      sex: 'male' as const,
      impedance: 500,
    };
    for (const change of [
      { impedance: 0 },
      { age: 12 },
      { heightMeters: 0 },
      { athlete: true },
      { weightKilograms: NaN },
    ])
      expect(calculateQnBodyComposition({ ...input, ...change })).toBeNull();
    expect(parseCompositionEstimate('{')).toBeNull();
    expect(parseCompositionEstimate('{}')).toBeNull();
  });
  it('keeps provider body fat separate and retains weight if calculations are unavailable', () => {
    const row = {
      weightG: 80000,
      timestamp: 1700000000,
      heightCm: 180,
      age: 30,
      gender: '2',
      impedance: 500,
      sportsMan: 0,
      bfr: 20,
    };
    const parse = (change: Record<string, unknown>) =>
      parseVeSyncReadings({ result: { weightDatas: [{ ...row, ...change }] } })[0];
    const valid = parse({});
    expect(valid.bodyFatPercent).toBe(20);
    expect(valid.compositionEstimate).toEqual(fixtures[0].expected);
    for (const change of [
      { impedance: 0 },
      { heightCm: undefined },
      { sportsMan: 1 },
      { gender: 'unknown' },
    ]) {
      const result = parse(change);
      expect(result.weightKilograms).toBe(80);
      expect(result.bodyFatPercent).toBe(20);
      expect(result.compositionEstimate).toBeUndefined();
    }
  });
});
