import { describe, expect, it } from 'vitest';

import { buildNutritionChartDatasets, type ChartGoal } from '@/lib/domain/nutrition-chart-datasets';

const baseGoal: ChartGoal = {
  id: 'goal',
  nutrientCode: 'energy_kcal',
  kind: 'target',
  value: 2_000,
  minimum: null,
  maximum: null,
  unit: 'kcal',
  sourceType: 'manual',
  state: 'active',
  startsOn: '2026-07-01',
  endsOn: null,
};

function build(
  confirmed: Record<string, number>,
  goals: ChartGoal[] = [baseGoal],
  planned: Record<string, number> = {},
) {
  return buildNutritionChartDatasets({
    profileLabel: 'Avery',
    date: '2026-07-19',
    confirmed,
    planned,
    recentCompleteness: 0.75,
    goals,
  });
}

describe('nutrition chart datasets', () => {
  it('keeps missing confirmed calories unknown and planned calories separate', () => {
    const result = build({}, [baseGoal], { energy_kcal: 1_500 });
    expect(result.calorie).toMatchObject({
      status: 'no_data',
      confirmedEnergy: null,
      plannedEnergy: 1_500,
      confirmedRemaining: null,
      confirmedVisualPercent: 0,
      plannedVisualPercent: 75,
    });
  });

  it('uses only confirmed calories for the goal comparison', () => {
    const result = build({ energy_kcal: 600 }, [baseGoal], { energy_kcal: 1_900 });
    expect(result.calorie).toMatchObject({
      status: 'ready',
      confirmedRemaining: 1_400,
      confirmedVisualPercent: 30,
      plannedVisualPercent: 95,
    });
    expect(result.calorie.takeaway).toContain('based on confirmed intake only');
  });

  it('declines to choose between multiple current calorie goals', () => {
    const result = build({ energy_kcal: 600 }, [
      baseGoal,
      { ...baseGoal, id: 'second', kind: 'limit', value: null, maximum: 2_500 },
    ]);
    expect(result.calorie.status).toBe('ambiguous_goal');
    expect(result.calorie.goal).toBeNull();
    expect(result.calorie.confirmedRemaining).toBeNull();
  });

  it('requires all three primary macros and treats absent alcohol as zero', () => {
    expect(build({ protein: 20, carbohydrate: 30 }).macroComposition.status).toBe('incomplete');
    const complete = build({ protein: 20, carbohydrate: 30, total_fat: 10 }).macroComposition;
    expect(complete.status).toBe('ready');
    if (complete.status !== 'ready') throw new Error('Expected complete macro data.');
    expect(complete.calculatedKcal).toBe(290);
    expect(complete.items.find((item) => item.code === 'alcohol')).toMatchObject({
      grams: 0,
      kcal: 0,
      percentOfCalculatedEnergy: 0,
    });
  });

  it('preserves target, minimum, range, and limit semantics with exact uncapped ratios', () => {
    const goals: ChartGoal[] = [
      { ...baseGoal, id: 'target', nutrientCode: 'protein', unit: 'g', value: 100 },
      {
        ...baseGoal,
        id: 'minimum',
        nutrientCode: 'fiber',
        kind: 'minimum',
        unit: 'g',
        value: 30,
      },
      {
        ...baseGoal,
        id: 'range',
        nutrientCode: 'sodium',
        kind: 'range',
        unit: 'mg',
        value: null,
        minimum: 1_000,
        maximum: 2_000,
      },
      {
        ...baseGoal,
        id: 'limit',
        nutrientCode: 'saturated_fat',
        kind: 'limit',
        unit: 'g',
        value: null,
        maximum: 20,
      },
    ];
    const rows = build(
      { protein: 50, fiber: 30, sodium: 2_500, saturated_fat: 25 },
      goals,
    ).coverage;
    expect(rows.map((row) => [row.id, row.status])).toEqual([
      ['target', 'below'],
      ['minimum', 'met'],
      ['range', 'above'],
      ['limit', 'above'],
    ]);
    expect(rows.find((row) => row.id === 'range')).toMatchObject({
      ratio: 1.25,
      visualPercent: 100,
    });
    expect(rows.find((row) => row.id === 'limit')?.comparison).toBe(
      '5 g above the configured limit.',
    );
  });

  it('marks an absent nutrient as no data instead of zero', () => {
    const proteinGoal = { ...baseGoal, nutrientCode: 'protein', unit: 'g', value: 80 };
    expect(build({}, [proteinGoal]).coverage[0]).toMatchObject({
      amount: null,
      ratio: null,
      visualPercent: 0,
      status: 'no_data',
      comparison: 'No confirmed value.',
    });
  });

  it('filters coverage to the selected canonical presentation without changing planned data', () => {
    const result = buildNutritionChartDatasets({
      profileLabel: 'Avery',
      date: '2026-07-19',
      confirmed: { energy_kcal: 500, protein: 20, fiber: 10 },
      planned: { energy_kcal: 900 },
      recentCompleteness: 0.8,
      visibleNutrientCodes: ['fiber'],
      showPlannedNutrition: false,
      goals: [
        { ...baseGoal, id: 'protein', nutrientCode: 'protein', unit: 'g', value: 80 },
        { ...baseGoal, id: 'fiber', nutrientCode: 'fiber', unit: 'g', value: 30 },
      ],
    });
    expect(result.coverage.map((row) => row.nutrientCode)).toEqual(['fiber']);
    expect(result.calorie.showPlannedNutrition).toBe(false);
    expect(result.calorie.plannedEnergy).toBe(900);
  });
});
