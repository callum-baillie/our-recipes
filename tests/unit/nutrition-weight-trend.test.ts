import { describe, expect, it } from 'vitest';

import { buildNutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';

function workspace(
  overrides: Partial<Parameters<typeof buildNutritionWeightTrend>[0]> = {},
): Parameters<typeof buildNutritionWeightTrend>[0] {
  return {
    profileLabel: 'Private Avery',
    timeZone: 'UTC',
    measurementSystem: 'metric',
    startDate: '2026-07-13',
    endDate: '2026-07-19',
    days: 7,
    targetWeightKilograms: null,
    status: 'enabled',
    measurements: [],
    ...overrides,
  } as Parameters<typeof buildNutritionWeightTrend>[0];
}

function observation(
  id: string,
  localDate: string,
  weightKilograms: number,
  measuredAt = `${localDate}T08:00:00.000Z`,
) {
  return {
    id,
    measuredAt,
    localDate,
    weightKilograms,
    sourceType: 'manual',
    approximate: false,
  };
}

describe('individual weight trend projection', () => {
  it('keeps disabled and empty states explicit', () => {
    const disabled = buildNutritionWeightTrend(workspace({ status: 'disabled', measurements: [] }));
    expect(disabled).toMatchObject({ status: 'disabled', observations: [], axis: null });
    expect(buildNutritionWeightTrend(workspace())).toMatchObject({
      status: 'empty',
      observations: [],
      axis: null,
    });
  });

  it.each([7, 14, 30] as const)('creates exactly %i visible average dates', (days) => {
    const endDate = '2026-07-30';
    const start = new Date(`${endDate}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() + 1 - days);
    const startDate = start.toISOString().slice(0, 10);
    const result = buildNutritionWeightTrend(
      workspace({
        days,
        startDate,
        endDate,
        measurements: [observation('visible', endDate, 70)],
      }),
    );
    expect(result.rollingAverages).toHaveLength(days);
    expect(result.rollingAverages[0]?.date).toBe(startDate);
    expect(result.rollingAverages.at(-1)?.date).toBe(endDate);
  });

  it('keeps same-day observations distinct but smooths with only the latest one', () => {
    const result = buildNutritionWeightTrend(
      workspace({
        measurements: [
          observation('early', '2026-07-19', 70, '2026-07-19T08:00:00.000Z'),
          observation('late', '2026-07-19', 72, '2026-07-19T20:00:00.000Z'),
        ],
      }),
    );
    expect(result.status).toBe('ready');
    expect(result.observations).toHaveLength(2);
    expect(result.rollingAverages.at(-1)).toMatchObject({
      displayWeight: 72,
      contributingDays: 1,
    });
  });

  it('averages present local days only and uses six leading days', () => {
    const result = buildNutritionWeightTrend(
      workspace({
        measurements: [
          observation('lead', '2026-07-12', 60),
          observation('visible-one', '2026-07-13', 70),
          observation('visible-two', '2026-07-19', 80),
        ],
      }),
    );
    expect(result.rollingAverages[0]).toMatchObject({
      date: '2026-07-13',
      displayWeight: 65,
      contributingDays: 2,
    });
    expect(result.rollingAverages.at(-1)).toMatchObject({
      date: '2026-07-19',
      displayWeight: 75,
      contributingDays: 2,
    });
  });

  it('converts display values to pounds while preserving canonical kilograms', () => {
    const metric = buildNutritionWeightTrend(
      workspace({ measurements: [observation('metric', '2026-07-19', 68.0389)] }),
    );
    const imperial = buildNutritionWeightTrend(
      workspace({
        measurementSystem: 'imperial',
        measurements: [observation('imperial', '2026-07-19', 68.0389)],
      }),
    );
    expect(metric.observations[0]).toMatchObject({ weightKilograms: 68.039, displayWeight: 68 });
    expect(imperial.observations[0]).toMatchObject({
      weightKilograms: 68.039,
      displayWeight: 150,
    });
    expect(imperial.unit).toBe('lb');
  });

  it('uses the larger of a five-kilogram or ten-percent midpoint axis span and includes target', () => {
    const compact = buildNutritionWeightTrend(
      workspace({
        targetWeightKilograms: 69,
        measurements: [observation('one', '2026-07-19', 70)],
      }),
    );
    expect(compact.axis!.maximumKilograms - compact.axis!.minimumKilograms).toBeCloseTo(6.95, 3);
    expect(compact.target).toMatchObject({ weightKilograms: 69 });
    expect(compact.target!.visualPercent).toBeGreaterThanOrEqual(0);
    expect(compact.target!.visualPercent).toBeLessThanOrEqual(100);

    const low = buildNutritionWeightTrend(
      workspace({ measurements: [observation('low', '2026-07-19', 20)] }),
    );
    expect(low.axis!.maximumKilograms - low.axis!.minimumKilograms).toBeCloseTo(5, 3);
  });
});
