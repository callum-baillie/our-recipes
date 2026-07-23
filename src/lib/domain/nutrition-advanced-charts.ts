import { macroEnergyDistribution, type NutrientAmounts } from '@/lib/domain/nutrition';

type Value = {
  nutrientCode: string;
  amount: number;
  completeness?: number;
};

type Goal = {
  id: string;
  seriesId: string;
  revision: number;
  nutrientCode: string;
  unit: string;
  sourceType: string;
  startsOn: string;
  endsOn: string | null;
  state: string;
  kind: 'target' | 'minimum' | 'range' | 'limit';
  value: number | null;
  minimum: number | null;
  maximum: number | null;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function totals(values: readonly Value[]) {
  const result: Record<string, number> = {};
  for (const value of values) {
    result[value.nutrientCode] = (result[value.nutrientCode] ?? 0) + value.amount;
  }
  return result;
}

function currentGoals(goals: readonly Goal[], nutrientCode: string, date: string) {
  const series = new Map<string, Goal[]>();
  for (const goal of goals) {
    if (goal.nutrientCode !== nutrientCode) continue;
    const rows = series.get(goal.seriesId) ?? [];
    rows.push(goal);
    series.set(goal.seriesId, rows);
  }
  const selected: Goal[] = [];
  for (const rows of series.values()) {
    const applicable = rows
      .filter((goal) => goal.startsOn <= date && (!goal.endsOn || goal.endsOn >= date))
      .sort((left, right) => right.revision - left.revision)[0];
    if (applicable?.state === 'active') selected.push(applicable);
  }
  return selected;
}

function goalStatus(amount: number, goal: Goal) {
  if (goal.kind === 'range') {
    if (amount < goal.minimum!) return 'below';
    if (amount > goal.maximum!) return 'above';
    return 'within';
  }
  if (goal.kind === 'limit') return amount > goal.maximum! ? 'above' : 'within';
  return amount >= goal.value! ? 'met' : 'below';
}

export function buildAdvancedNutritionCharts(input: {
  profileLabel: string;
  startDate: string;
  endDate: string;
  days: 7 | 14 | 30;
  showPlannedNutrition?: boolean;
  selectedNutrients: string[];
  goalContext: 'available' | 'unavailable';
  entries: Array<{
    id: string;
    seriesId: string;
    localDate: string;
    mealSlot: string;
    sourceType: 'recipe' | 'product' | 'manual';
    sourceName: string;
    recipeId: string | null;
    productId: string | null;
    values: Array<Value & { confidence: number; estimated: boolean }>;
  }>;
  plans: Array<{
    id: string;
    date: string;
    meal: string;
    servings: number | null;
    completeness: number | null;
    unavailableReason: string | null;
    values: Value[];
  }>;
  goals: Goal[];
}) {
  const dates = Array.from({ length: input.days }, (_, index) => addDays(input.startDate, index));
  const entriesByDate = new Map(
    dates.map((date) => [date, input.entries.filter((entry) => entry.localDate === date)]),
  );
  const plansByDate = new Map(
    dates.map((date) => [date, input.plans.filter((plan) => plan.date === date)]),
  );
  const daily = dates.map((date) => {
    const entries = entriesByDate.get(date)!;
    const plans = plansByDate.get(date)!;
    const confirmed = totals(entries.flatMap((entry) => entry.values));
    const planned = totals(plans.flatMap((plan) => plan.values));
    const selectedValues = entries.flatMap((entry) =>
      input.selectedNutrients.flatMap((code) => {
        const value = entry.values.find((candidate) => candidate.nutrientCode === code);
        return value ? [value] : [];
      }),
    );
    const fullyDocumented =
      entries.length > 0 &&
      entries.every((entry) =>
        input.selectedNutrients.every((code) => {
          const value = entry.values.find((candidate) => candidate.nutrientCode === code);
          return value?.completeness === 1;
        }),
      );
    const averageCompleteness =
      selectedValues.length === 0
        ? null
        : selectedValues.reduce((sum, value) => sum + (value.completeness ?? 0), 0) /
          selectedValues.length;
    return {
      date,
      entryCount: entries.length,
      confirmed,
      planned,
      planCount: plans.length,
      planEvidenceIncomplete: plans.some((plan) => plan.unavailableReason !== null),
      completenessStatus:
        entries.length === 0
          ? ('missing' as const)
          : fullyDocumented
            ? ('fully_documented' as const)
            : ('partial' as const),
      averageCompleteness,
    };
  });

  const calorieTrend = daily.map((day, index) => {
    const confirmed = day.confirmed.energy_kcal ?? null;
    const planned = day.planned.energy_kcal ?? null;
    const window = daily
      .slice(Math.max(0, index - 6), index + 1)
      .map((candidate) => candidate.confirmed.energy_kcal)
      .filter((value): value is number => value !== undefined);
    const goals =
      input.goalContext === 'available' ? currentGoals(input.goals, 'energy_kcal', day.date) : [];
    return {
      date: day.date,
      confirmed,
      planned,
      rollingAverage:
        window.length === 0 ? null : window.reduce((sum, value) => sum + value, 0) / window.length,
      goalStatus:
        input.goalContext === 'unavailable'
          ? ('unavailable' as const)
          : goals.length > 1
            ? ('ambiguous' as const)
            : goals.length === 0
              ? ('none' as const)
              : ('available' as const),
      goal: goals.length === 1 ? goals[0]! : null,
      completenessStatus: day.completenessStatus,
      planEvidenceIncomplete: day.planEvidenceIncomplete,
    };
  });

  const macroTrend = daily.map((day) => {
    const distribution = macroEnergyDistribution(day.confirmed as NutrientAmounts);
    return {
      date: day.date,
      status: distribution ? ('ready' as const) : ('incomplete' as const),
      items: distribution?.items ?? [],
    };
  });

  const heatmap =
    input.goalContext === 'unavailable'
      ? []
      : input.selectedNutrients.flatMap((nutrientCode) =>
          daily.map((day) => {
            const entries = entriesByDate.get(day.date)!;
            const amount = day.confirmed[nutrientCode] ?? null;
            const evidenceComplete =
              entries.length > 0 &&
              entries.every(
                (entry) =>
                  entry.values.find((value) => value.nutrientCode === nutrientCode)
                    ?.completeness === 1,
              );
            const goals = currentGoals(input.goals, nutrientCode, day.date);
            const goal = goals.length === 1 ? goals[0]! : null;
            const status =
              amount === null
                ? ('missing_value' as const)
                : goals.length > 1
                  ? ('ambiguous_goal' as const)
                  : !evidenceComplete
                    ? ('incomplete_evidence' as const)
                    : !goal
                      ? ('no_goal' as const)
                      : goalStatus(amount, goal);
            return {
              nutrientCode,
              date: day.date,
              amount,
              evidenceComplete,
              goal,
              status,
            };
          }),
        );

  const comparisonCodes = [
    ...new Set(['energy_kcal', 'protein', 'carbohydrate', 'total_fat', ...input.selectedNutrients]),
  ];
  const plannedVersusConsumed = comparisonCodes.flatMap((nutrientCode) =>
    daily.map((day) => {
      const plans = plansByDate.get(day.date)!;
      return {
        nutrientCode,
        date: day.date,
        consumed: day.confirmed[nutrientCode] ?? null,
        planned: day.planned[nutrientCode] ?? null,
        planEvidenceIncomplete:
          plans.length > 0 &&
          plans.some(
            (plan) =>
              plan.unavailableReason !== null ||
              !plan.values.some((value) => value.nutrientCode === nutrientCode),
          ),
      };
    }),
  );

  const sourceRankings = Object.fromEntries(
    input.selectedNutrients.map((nutrientCode) => {
      const sources = new Map<
        string,
        {
          key: string;
          label: string;
          sourceType: 'recipe' | 'product' | 'manual';
          recipeId: string | null;
          productId: string | null;
          amount: number;
        }
      >();
      for (const entry of input.entries) {
        const amount = entry.values.find((value) => value.nutrientCode === nutrientCode)?.amount;
        if (amount === undefined) continue;
        const identity =
          entry.sourceType === 'recipe'
            ? `recipe:${entry.recipeId ?? entry.sourceName}`
            : entry.sourceType === 'product'
              ? `product:${entry.productId ?? entry.sourceName}`
              : `manual:${entry.sourceName || 'Manual entry'}`;
        const current = sources.get(identity) ?? {
          key: identity,
          label: entry.sourceName || 'Manual entry',
          sourceType: entry.sourceType,
          recipeId: entry.recipeId,
          productId: entry.productId,
          amount: 0,
        };
        current.amount += amount;
        sources.set(identity, current);
      }
      const rows = [...sources.values()].sort(
        (left, right) => right.amount - left.amount || left.label.localeCompare(right.label),
      );
      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      return [
        nutrientCode,
        rows.map((row) => ({
          ...row,
          percentOfRecorded: total === 0 ? null : (row.amount / total) * 100,
        })),
      ];
    }),
  );

  return {
    profileLabel: input.profileLabel,
    startDate: input.startDate,
    endDate: input.endDate,
    goalContext: input.goalContext,
    showPlannedNutrition: input.showPlannedNutrition ?? true,
    calorieTrend,
    macroTrend,
    heatmap,
    plannedVersusConsumed,
    sourceRankings,
    recordCompleteness: daily.map((day) => ({
      date: day.date,
      status: day.completenessStatus,
      entryCount: day.entryCount,
      averageCompleteness: day.averageCompleteness,
    })),
  };
}

export type AdvancedNutritionCharts = ReturnType<typeof buildAdvancedNutritionCharts>;
