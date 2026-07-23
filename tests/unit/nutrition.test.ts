import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DASHBOARD_NUTRIENTS,
  ENERGY_FACTORS_KCAL_PER_GRAM,
  NUTRIENT_CODES,
  NUTRIENT_DEFINITIONS,
  addNutrientAmounts,
  aggregateRecipeNutrition,
  dailyNutritionTotals,
  evaluateNutritionGoal,
  macroCalculatedEnergy,
  macroEnergyDistribution,
  normalizeNutrientAmounts,
  normalizedHouseholdComparisons,
  nutrientAmount,
  nutrientTrend,
  resolveEnergy,
  rollingAverage,
  roundNutrientAmounts,
  scaleNutrientAmounts,
  scaleRecipeNutrition,
} from '@/lib/domain/nutrition';

describe('canonical nutrient definitions', () => {
  it('defines every supported code exactly once in display order', () => {
    expect(NUTRIENT_DEFINITIONS.map((definition) => definition.code)).toHaveLength(
      NUTRIENT_CODES.length,
    );
    expect(new Set(NUTRIENT_DEFINITIONS.map((definition) => definition.code)).size).toBe(
      NUTRIENT_CODES.length,
    );
    expect(NUTRIENT_DEFINITIONS.map((definition) => definition.displayOrder)).toEqual(
      [...NUTRIENT_DEFINITIONS]
        .sort((left, right) => left.displayOrder - right.displayOrder)
        .map((definition) => definition.displayOrder),
    );
  });

  it('keeps the default dashboard concise while covering energy, macros, minerals, and vitamins', () => {
    expect(DEFAULT_DASHBOARD_NUTRIENTS).toContain('energy_kcal');
    expect(DEFAULT_DASHBOARD_NUTRIENTS).toContain('protein');
    expect(DEFAULT_DASHBOARD_NUTRIENTS).toContain('sodium');
    expect(DEFAULT_DASHBOARD_NUTRIENTS).toContain('vitamin_d');
    expect(DEFAULT_DASHBOARD_NUTRIENTS.length).toBeLessThan(15);
  });
});

describe('nutrient vector arithmetic', () => {
  it('preserves explicit zero and distinguishes it from missing', () => {
    const amounts = normalizeNutrientAmounts({ protein: 0 });
    expect(nutrientAmount(amounts, 'protein')).toBe(0);
    expect(nutrientAmount(amounts, 'iron')).toBeNull();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid nutrient amounts (%s)',
    (protein) => {
      expect(() => normalizeNutrientAmounts({ protein })).toThrow(/finite non-negative/u);
    },
  );

  it('adds only present nutrients without inventing missing values', () => {
    expect(addNutrientAmounts([{ protein: 10 }, { protein: 5, iron: 2 }])).toEqual({
      protein: 15,
      iron: 2,
    });
  });

  it('scales fractional portions and rejects negative multipliers', () => {
    expect(scaleNutrientAmounts({ protein: 10, sodium: 200 }, 0.25)).toEqual({
      protein: 2.5,
      sodium: 50,
    });
    expect(() => scaleNutrientAmounts({ protein: 10 }, -0.5)).toThrow(/multiplier/u);
  });

  it('rounds by nutrient display precision unless explicitly overridden', () => {
    expect(roundNutrientAmounts({ energy_kcal: 123.6, protein: 1.26, iron: 2.349 })).toEqual({
      energy_kcal: 124,
      protein: 1.3,
      iron: 2.3,
    });
    expect(roundNutrientAmounts({ protein: 1.234 }, { protein: 2 })).toEqual({ protein: 1.23 });
  });
});

describe('energy and macro calculations', () => {
  const macros = { protein: 10, carbohydrate: 20, total_fat: 5, alcohol: 2 } as const;

  it('uses documented general energy factors', () => {
    expect(ENERGY_FACTORS_KCAL_PER_GRAM).toEqual({
      protein: 4,
      carbohydrate: 4,
      totalFat: 9,
      alcohol: 7,
    });
    expect(macroCalculatedEnergy(macros)).toBe(179);
  });

  it('requires protein, carbohydrate, and fat before deriving calories', () => {
    expect(macroCalculatedEnergy({ protein: 10, carbohydrate: 20 })).toBeNull();
  });

  it('prefers a reliable supplied energy value and reports a material inconsistency', () => {
    const resolution = resolveEnergy({ ...macros, energy_kcal: 300 });
    expect(resolution.kcal).toBe(300);
    expect(resolution.method).toBe('supplied');
    expect(resolution.estimated).toBe(false);
    expect(resolution.inconsistency?.differencePercent).toBeGreaterThan(20);
  });

  it('uses a marked estimated macro fallback only when supplied energy is absent or unreliable', () => {
    expect(resolveEnergy(macros)).toMatchObject({
      kcal: 179,
      method: 'macro-fallback',
      estimated: true,
    });
    expect(
      resolveEnergy({ ...macros, energy_kcal: 300 }, { suppliedEnergyReliable: false }),
    ).toMatchObject({ kcal: 179, method: 'macro-fallback', estimated: true });
  });

  it('returns unavailable rather than zero when calories cannot be calculated', () => {
    expect(resolveEnergy({ protein: 10 })).toEqual({
      kcal: null,
      method: 'unavailable',
      estimated: false,
      calculatedKcal: null,
      inconsistency: null,
    });
  });

  it('calculates macro grams, calories, and percentage of calculated energy', () => {
    const distribution = macroEnergyDistribution(macros);
    expect(distribution?.calculatedKcal).toBe(179);
    expect(distribution?.items.find((item) => item.code === 'protein')).toMatchObject({
      grams: 10,
      kcal: 40,
    });
    expect(
      distribution?.items.reduce((sum, item) => sum + item.percentOfCalculatedEnergy, 0),
    ).toBeCloseTo(100);
  });
});

describe('recipe nutrition aggregation and scaling', () => {
  it('applies explicit multipliers, edible portions, drained yield, and per-nutrient retention', () => {
    const calculation = aggregateRecipeNutrition(
      [
        {
          id: 'beans',
          amounts: { protein: 10, sodium: 100, vitamin_c: 20 },
          amountMultiplier: 2,
          ediblePortion: 0.8,
          drainedYield: 0.5,
          retention: { vitamin_c: 0.5 },
          confidence: 0.9,
        },
      ],
      ['protein', 'sodium', 'vitamin_c'],
    );
    expect(calculation.amounts).toEqual({ protein: 8, sodium: 80, vitamin_c: 8 });
    expect(calculation.completeness).toBe(1);
    expect(calculation.confidence).toBe(0.9);
  });

  it('excludes optional ingredients unless explicitly included', () => {
    const calculation = aggregateRecipeNutrition(
      [
        { id: 'base', amounts: { protein: 10 } },
        { id: 'optional-cheese', optional: true, amounts: { protein: 5 } },
        { id: 'included-garnish', optional: true, included: true, amounts: { protein: 2 } },
      ],
      ['protein'],
    );
    expect(calculation.amounts.protein).toBe(12);
    expect(calculation.includedContributionIds).toEqual(['base', 'included-garnish']);
    expect(calculation.excludedContributionIds).toEqual(['optional-cheese']);
  });

  it('calculates nutrient-specific and overall completeness without treating missing as zero', () => {
    const calculation = aggregateRecipeNutrition(
      [
        { id: 'known', amounts: { protein: 10, iron: 2 }, coverageWeight: 3, confidence: 0.8 },
        { id: 'partial', amounts: { protein: 5 }, coverageWeight: 1, confidence: 0.6 },
      ],
      ['protein', 'iron'],
    );
    expect(calculation.perNutrientCompleteness.protein).toBe(1);
    expect(calculation.perNutrientCompleteness.iron).toBe(0.75);
    expect(calculation.completeness).toBe(0.875);
    expect(calculation.confidence).toBe(0.6);
  });

  it('rejects speculative or invalid factor inputs', () => {
    expect(() =>
      aggregateRecipeNutrition([{ id: 'bad', amounts: { protein: 1 }, ediblePortion: 1.2 }]),
    ).toThrow(/between 0 and 1/u);
    expect(() =>
      aggregateRecipeNutrition([{ id: 'bad', amounts: { protein: 1 }, amountMultiplier: -1 }]),
    ).toThrow(/finite non-negative/u);
  });

  it('produces total, per-serving, per-100g, selected-serving, and portion values', () => {
    const scaled = scaleRecipeNutrition(
      { energy_kcal: 800, protein: 40 },
      { servings: 4, finalWeightGrams: 1_000, selectedServings: 1.5, portionWeightGrams: 250 },
    );
    expect(scaled.total).toEqual({ energy_kcal: 800, protein: 40 });
    expect(scaled.perServing).toEqual({ energy_kcal: 200, protein: 10 });
    expect(scaled.per100Grams).toEqual({ energy_kcal: 80, protein: 4 });
    expect(scaled.selectedServings).toEqual({ energy_kcal: 300, protein: 15 });
    expect(scaled.portion).toEqual({ energy_kcal: 200, protein: 10 });
  });

  it('keeps total nutrition unchanged when final cooked weight changes', () => {
    const wetter = scaleRecipeNutrition({ protein: 40 }, { servings: 4, finalWeightGrams: 1_000 });
    const drier = scaleRecipeNutrition({ protein: 40 }, { servings: 4, finalWeightGrams: 500 });
    expect(wetter.total).toEqual(drier.total);
    expect(wetter.per100Grams?.protein).toBe(4);
    expect(drier.per100Grams?.protein).toBe(8);
  });

  it.each([
    [{ servings: 0 }, /servings/u],
    [{ servings: 4, finalWeightGrams: 0 }, /weight/u],
    [{ servings: 4, selectedServings: -1 }, /Selected servings/u],
    [{ servings: 4, portionWeightGrams: -1 }, /Portion weight/u],
  ])('rejects invalid scaling options', (options, message) => {
    expect(() => scaleRecipeNutrition({ protein: 1 }, options)).toThrow(message);
  });
});

describe('target, range, and limit semantics', () => {
  it('reports coverage and remaining for a target', () => {
    expect(evaluateNutritionGoal(75, { kind: 'target', value: 100 })).toEqual({
      kind: 'target',
      amount: 75,
      status: 'below',
      coveragePercent: 75,
      percentOfMinimum: null,
      percentOfMaximum: null,
      remaining: 25,
      above: 0,
    });
  });

  it('reports lower and upper context for a range', () => {
    const below = evaluateNutritionGoal(40, { kind: 'range', minimum: 50, maximum: 80 });
    const within = evaluateNutritionGoal(60, { kind: 'range', minimum: 50, maximum: 80 });
    const above = evaluateNutritionGoal(90, { kind: 'range', minimum: 50, maximum: 80 });
    expect(below).toMatchObject({
      status: 'below',
      remaining: 10,
      above: 0,
      coveragePercent: null,
    });
    expect(within).toMatchObject({ status: 'within', remaining: 0, above: 0 });
    expect(above).toMatchObject({ status: 'above', remaining: 0, above: 10 });
  });

  it('reports limit usage without presenting it as coverage to reach', () => {
    const result = evaluateNutritionGoal(1_500, { kind: 'limit', maximum: 2_000 });
    expect(result).toMatchObject({
      status: 'within',
      coveragePercent: null,
      percentOfMaximum: 75,
      remaining: 500,
      above: 0,
    });
  });

  it('rejects invalid goal bounds', () => {
    expect(() => evaluateNutritionGoal(1, { kind: 'target', value: 0 })).toThrow(/positive/u);
    expect(() => evaluateNutritionGoal(1, { kind: 'range', minimum: 10, maximum: 5 })).toThrow(
      /ordered/u,
    );
    expect(() => evaluateNutritionGoal(1, { kind: 'limit', maximum: Number.NaN })).toThrow(
      /positive/u,
    );
  });
});

describe('planned, consumed, trend, and household datasets', () => {
  it('keeps planned and consumed totals and completeness separate', () => {
    expect(
      dailyNutritionTotals([
        { kind: 'consumed', amounts: { energy_kcal: 400, protein: 20 }, completeness: 0.8 },
        { kind: 'consumed', amounts: { energy_kcal: 200 }, completeness: 0.6 },
        { kind: 'planned', amounts: { energy_kcal: 700, protein: 30 }, completeness: 1 },
      ]),
    ).toEqual({
      consumed: { energy_kcal: 600, protein: 20 },
      planned: { energy_kcal: 700, protein: 30 },
      consumedCompleteness: 0.7,
      plannedCompleteness: 1,
    });
  });

  it('represents missing days and missing nutrients as null rather than zero', () => {
    expect(
      nutrientTrend(
        [
          { date: '2026-07-01', amounts: { energy_kcal: 1_800 }, completeness: 1 },
          { date: '2026-07-02', amounts: null },
          { date: '2026-07-03', amounts: { protein: 60 }, completeness: 0.5 },
        ],
        'energy_kcal',
      ),
    ).toEqual([
      { date: '2026-07-01', value: 1_800, completeness: 1 },
      { date: '2026-07-02', value: null, completeness: null },
      { date: '2026-07-03', value: null, completeness: 0.5 },
    ]);
  });

  it('calculates rolling averages from available days only', () => {
    const points = [
      { date: '2026-07-01', value: 1_000, completeness: 1 },
      { date: '2026-07-02', value: null, completeness: null },
      { date: '2026-07-03', value: 2_000, completeness: 1 },
      { date: '2026-07-04', value: 3_000, completeness: 1 },
    ];
    const rolling = rollingAverage(points, 3);
    expect(rolling.map((point) => point.rollingAverage)).toEqual([1_000, 1_000, 1_500, 2_500]);
    expect(rolling.map((point) => point.sampleDays)).toEqual([1, 1, 2, 2]);
  });

  it('returns null when a rolling window has no logged value', () => {
    expect(
      rollingAverage([{ date: '2026-07-01', value: null, completeness: null }], 7)[0],
    ).toMatchObject({ rollingAverage: null, sampleDays: 0 });
  });

  it('filters hidden profiles before producing normalized comparisons', () => {
    const comparisons = normalizedHouseholdComparisons([
      {
        profileId: 'visible-target',
        displayLabel: 'A',
        visibleInComparison: true,
        amount: 1_800,
        goal: { kind: 'target', value: 2_000 },
        completeness: 0.9,
      },
      {
        profileId: 'hidden',
        displayLabel: 'Private adult',
        visibleInComparison: false,
        amount: 2_100,
        goal: { kind: 'target', value: 2_000 },
        completeness: 1,
      },
      {
        profileId: 'visible-limit',
        displayLabel: 'B',
        visibleInComparison: true,
        amount: 1_500,
        goal: { kind: 'limit', maximum: 2_000 },
        completeness: 0.8,
      },
    ]);
    expect(comparisons.map((comparison) => comparison.profileId)).toEqual([
      'visible-target',
      'visible-limit',
    ]);
    expect(comparisons[0]).toMatchObject({ semantic: 'coverage', normalizedPercent: 90 });
    expect(comparisons[1]).toMatchObject({ semantic: 'limit-usage', normalizedPercent: 75 });
    expect(JSON.stringify(comparisons)).not.toContain('Private adult');
  });

  it('uses each profile own range rather than comparing raw intake', () => {
    expect(
      normalizedHouseholdComparisons([
        {
          profileId: 'child',
          displayLabel: 'Child',
          visibleInComparison: true,
          amount: 40,
          goal: { kind: 'range', minimum: 40, maximum: 60 },
          completeness: 1,
        },
        {
          profileId: 'adult',
          displayLabel: 'Adult',
          visibleInComparison: true,
          amount: 80,
          goal: { kind: 'range', minimum: 80, maximum: 120 },
          completeness: 1,
        },
      ]).map((comparison) => comparison.normalizedPercent),
    ).toEqual([100, 100]);
  });
});
