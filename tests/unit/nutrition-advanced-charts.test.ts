import { describe, expect, it } from 'vitest';

import { buildAdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';

const base = {
  profileLabel: 'Avery',
  startDate: '2026-07-13',
  endDate: '2026-07-19',
  days: 7 as const,
  selectedNutrients: ['fiber'],
  goalContext: 'available' as const,
  entries: [],
  plans: [],
  goals: [],
};

const entry = (
  id: string,
  localDate: string,
  values: Array<{ nutrientCode: string; amount: number; completeness?: number }>,
) => ({
  id,
  seriesId: id,
  localDate,
  mealSlot: 'dinner',
  sourceType: 'manual' as const,
  sourceName: 'Recorded dinner',
  recipeId: null,
  productId: null,
  values: values.map((value) => ({
    confidence: 0.9,
    estimated: false,
    completeness: 1,
    ...value,
  })),
});

describe('advanced individual Nutrition datasets', () => {
  it('preserves missing calories and averages only present trailing values', () => {
    const charts = buildAdvancedNutritionCharts({
      ...base,
      entries: [
        entry('one', '2026-07-13', [
          { nutrientCode: 'energy_kcal', amount: 100 },
          { nutrientCode: 'fiber', amount: 5 },
        ]),
        entry('two', '2026-07-15', [
          { nutrientCode: 'energy_kcal', amount: 300 },
          { nutrientCode: 'fiber', amount: 7 },
        ]),
      ],
    });
    expect(charts.calorieTrend[1]).toMatchObject({ confirmed: null, rollingAverage: 100 });
    expect(charts.calorieTrend[2]).toMatchObject({ confirmed: 300, rollingAverage: 200 });
    expect(charts.recordCompleteness[1]?.status).toBe('missing');
  });

  it('uses the highest applicable goal revision per day and honors pause/future dates', () => {
    const charts = buildAdvancedNutritionCharts({
      ...base,
      goals: [
        {
          id: 'first',
          seriesId: 'energy',
          revision: 1,
          nutrientCode: 'energy_kcal',
          unit: 'kcal',
          sourceType: 'user_defined',
          startsOn: '2026-07-01',
          endsOn: null,
          state: 'active',
          kind: 'target',
          value: 2_000,
          minimum: null,
          maximum: null,
        },
        {
          id: 'paused',
          seriesId: 'energy',
          revision: 2,
          nutrientCode: 'energy_kcal',
          unit: 'kcal',
          sourceType: 'user_defined',
          startsOn: '2026-07-15',
          endsOn: null,
          state: 'paused',
          kind: 'target',
          value: 2_000,
          minimum: null,
          maximum: null,
        },
        {
          id: 'future',
          seriesId: 'energy',
          revision: 3,
          nutrientCode: 'energy_kcal',
          unit: 'kcal',
          sourceType: 'user_defined',
          startsOn: '2026-07-18',
          endsOn: null,
          state: 'active',
          kind: 'target',
          value: 2_200,
          minimum: null,
          maximum: null,
        },
      ],
    });
    expect(charts.calorieTrend[0]?.goal?.id).toBe('first');
    expect(charts.calorieTrend[2]?.goalStatus).toBe('none');
    expect(charts.calorieTrend[5]?.goal?.id).toBe('future');
  });

  it('builds macro grams and calculated-percent data only from complete primary macros', () => {
    const charts = buildAdvancedNutritionCharts({
      ...base,
      entries: [
        entry('complete', '2026-07-13', [
          { nutrientCode: 'protein', amount: 20 },
          { nutrientCode: 'carbohydrate', amount: 30 },
          { nutrientCode: 'total_fat', amount: 10 },
          { nutrientCode: 'fiber', amount: 5 },
        ]),
        entry('incomplete', '2026-07-14', [
          { nutrientCode: 'protein', amount: 20 },
          { nutrientCode: 'fiber', amount: 5 },
        ]),
      ],
    });
    expect(charts.macroTrend[0]).toMatchObject({ status: 'ready' });
    expect(charts.macroTrend[0]?.items.find((item) => item.code === 'protein')).toMatchObject({
      grams: 20,
      kcal: 80,
    });
    expect(charts.macroTrend[1]).toMatchObject({ status: 'incomplete', items: [] });
  });

  it('keeps incomplete heatmap evidence separate from semantic goal status', () => {
    const charts = buildAdvancedNutritionCharts({
      ...base,
      entries: [
        entry('partial', '2026-07-13', [{ nutrientCode: 'fiber', amount: 20, completeness: 0.5 }]),
      ],
      goals: [
        {
          id: 'fiber-goal',
          seriesId: 'fiber',
          revision: 1,
          nutrientCode: 'fiber',
          unit: 'g',
          sourceType: 'user_defined',
          startsOn: '2026-07-01',
          endsOn: null,
          state: 'active',
          kind: 'minimum',
          value: 30,
          minimum: null,
          maximum: null,
        },
      ],
    });
    expect(charts.heatmap[0]).toMatchObject({
      amount: 20,
      evidenceComplete: false,
      status: 'incomplete_evidence',
    });
    expect(charts.recordCompleteness[0]).toMatchObject({ status: 'partial' });
  });

  it('reports goal ambiguity before incomplete evidence and missing planned nutrients explicitly', () => {
    const duplicateGoal = {
      id: 'fiber-one',
      seriesId: 'fiber-one',
      revision: 1,
      nutrientCode: 'fiber',
      unit: 'g',
      sourceType: 'user_defined',
      startsOn: '2026-07-01',
      endsOn: null,
      state: 'active',
      kind: 'minimum' as const,
      value: 30,
      minimum: null,
      maximum: null,
    };
    const charts = buildAdvancedNutritionCharts({
      ...base,
      entries: [
        entry('partial', '2026-07-13', [{ nutrientCode: 'fiber', amount: 20, completeness: 0.5 }]),
      ],
      plans: [
        {
          id: 'plan',
          date: '2026-07-13',
          meal: 'dinner',
          servings: 1,
          completeness: 1,
          unavailableReason: null,
          values: [{ nutrientCode: 'energy_kcal', amount: 500 }],
        },
      ],
      goals: [duplicateGoal, { ...duplicateGoal, id: 'fiber-two', seriesId: 'fiber-two' }],
    });
    expect(charts.heatmap[0]?.status).toBe('ambiguous_goal');
    expect(
      charts.plannedVersusConsumed.find(
        (row) => row.date === '2026-07-13' && row.nutrientCode === 'fiber',
      ),
    ).toMatchObject({ planned: null, planEvidenceIncomplete: true });
  });

  it('keeps planned amounts separate and ranks immutable confirmed source snapshots', () => {
    const charts = buildAdvancedNutritionCharts({
      ...base,
      entries: [
        entry('first', '2026-07-19', [{ nutrientCode: 'fiber', amount: 8 }]),
        {
          ...entry('second', '2026-07-19', [{ nutrientCode: 'fiber', amount: 2 }]),
          sourceName: 'Lentil soup',
          sourceType: 'recipe',
          recipeId: 'recipe-id',
        },
      ],
      plans: [
        {
          id: 'plan',
          date: '2026-07-19',
          meal: 'dinner',
          servings: 1,
          completeness: 0.8,
          unavailableReason: null,
          values: [{ nutrientCode: 'fiber', amount: 12 }],
        },
      ],
    });
    expect(
      charts.plannedVersusConsumed.find(
        (row) => row.nutrientCode === 'fiber' && row.date === '2026-07-19',
      ),
    ).toMatchObject({
      consumed: 10,
      planned: 12,
    });
    expect(charts.sourceRankings.fiber).toEqual([
      expect.objectContaining({ label: 'Recorded dinner', amount: 8, percentOfRecorded: 80 }),
      expect.objectContaining({ label: 'Lentil soup', amount: 2, percentOfRecorded: 20 }),
    ]);
  });

  it('omits semantic heatmap data when goal context is not authorized', () => {
    const charts = buildAdvancedNutritionCharts({ ...base, goalContext: 'unavailable' });
    expect(charts.heatmap).toEqual([]);
    expect(charts.calorieTrend.every((day) => day.goalStatus === 'unavailable')).toBe(true);
  });
});
