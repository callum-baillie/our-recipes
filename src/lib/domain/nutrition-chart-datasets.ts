import { macroEnergyDistribution, type NutrientAmounts } from '@/lib/domain/nutrition';

export type ChartGoal = {
  id: string;
  nutrientCode: string;
  kind: 'target' | 'minimum' | 'range' | 'limit';
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  sourceType: string;
  state: string;
  startsOn: string;
  endsOn: string | null;
};

function current(goal: ChartGoal, date: string) {
  return goal.state === 'active' && goal.startsOn <= date && (!goal.endsOn || goal.endsOn >= date);
}

function boundary(goal: ChartGoal) {
  if (goal.kind === 'target' || goal.kind === 'minimum') return goal.value;
  return goal.maximum;
}

export function nutritionGoalComparison(
  goals: ChartGoal[],
  date: string,
  code: string,
  amount: number | null,
) {
  const matching = goals.filter((goal) => goal.nutrientCode === code && current(goal, date));
  const goal = matching.length === 1 ? matching[0]! : null;
  const status =
    matching.length > 1
      ? ('ambiguous_goal' as const)
      : amount === null
        ? ('no_data' as const)
        : goal
          ? ('ready' as const)
          : ('no_goal' as const);
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const description =
    matching.length > 1
      ? 'Multiple current goals; choose which version to keep before comparing.'
      : amount === null
        ? 'No recorded value for this nutrient.'
        : !goal
          ? 'Recorded amount; no current goal comparison.'
          : goal.kind === 'range'
            ? amount < goal.minimum!
              ? `${format(goal.minimum! - amount)} ${goal.unit} below the ${format(goal.minimum!)}–${format(goal.maximum!)} ${goal.unit} range.`
              : amount > goal.maximum!
                ? `${format(amount - goal.maximum!)} ${goal.unit} above the ${format(goal.minimum!)}–${format(goal.maximum!)} ${goal.unit} range.`
                : `Within the ${format(goal.minimum!)}–${format(goal.maximum!)} ${goal.unit} range.`
            : goal.kind === 'limit'
              ? amount > goal.maximum!
                ? `${format(amount - goal.maximum!)} ${goal.unit} above the ${format(goal.maximum!)} ${goal.unit} limit.`
                : `${format(goal.maximum! - amount)} ${goal.unit} before the ${format(goal.maximum!)} ${goal.unit} limit.`
              : amount < goal.value!
                ? `${format(goal.value! - amount)} ${goal.unit} below the ${format(goal.value!)} ${goal.unit} ${goal.kind}.`
                : amount === goal.value
                  ? `At the ${format(goal.value!)} ${goal.unit} ${goal.kind}.`
                  : `${format(amount - goal.value!)} ${goal.unit} above the ${format(goal.value!)} ${goal.unit} ${goal.kind}.`;
  return {
    status,
    goal,
    description,
    amount,
    visualPercent:
      amount !== null && goal && boundary(goal)
        ? Math.min(100, Math.max(0, (amount / boundary(goal)!) * 100))
        : null,
  };
}

export function buildNutritionChartDatasets(input: {
  profileLabel: string;
  date: string;
  confirmed: Record<string, number>;
  planned: Record<string, number>;
  recentCompleteness: number | null;
  goals: ChartGoal[];
  visibleNutrientCodes?: readonly string[];
  showPlannedNutrition?: boolean;
}) {
  const visibleNutrientCodes = input.visibleNutrientCodes
    ? new Set(input.visibleNutrientCodes)
    : null;
  const energyGoals = input.goals.filter(
    (goal) => goal.nutrientCode === 'energy_kcal' && current(goal, input.date),
  );
  const confirmedEnergy = input.confirmed.energy_kcal ?? null;
  const plannedEnergy = input.planned.energy_kcal ?? null;
  const energyGoal = energyGoals.length === 1 ? energyGoals[0]! : null;
  const energyBoundary = energyGoal ? boundary(energyGoal) : null;
  const confirmedRemaining =
    confirmedEnergy === null || !energyGoal
      ? null
      : energyGoal.kind === 'range'
        ? confirmedEnergy < energyGoal.minimum!
          ? energyGoal.minimum! - confirmedEnergy
          : confirmedEnergy > energyGoal.maximum!
            ? energyGoal.maximum! - confirmedEnergy
            : 0
        : energyBoundary! - confirmedEnergy;
  const calorie = {
    status:
      energyGoals.length > 1
        ? ('ambiguous_goal' as const)
        : confirmedEnergy === null
          ? ('no_data' as const)
          : energyGoal
            ? ('ready' as const)
            : ('no_goal' as const),
    profileLabel: input.profileLabel,
    date: input.date,
    confirmedEnergy,
    plannedEnergy,
    goal: energyGoal,
    confirmedRemaining,
    recentCompleteness: input.recentCompleteness,
    showPlannedNutrition: input.showPlannedNutrition ?? true,
    confirmedVisualPercent:
      confirmedEnergy === null || energyBoundary === null
        ? 0
        : Math.min(100, Math.max(0, (confirmedEnergy / energyBoundary) * 100)),
    plannedVisualPercent:
      plannedEnergy === null || energyBoundary === null
        ? 0
        : Math.min(100, Math.max(0, (plannedEnergy / energyBoundary) * 100)),
    takeaway:
      energyGoals.length > 1
        ? 'More than one current calorie goal exists, so no goal comparison is selected.'
        : confirmedEnergy === null
          ? 'No confirmed calorie value is recorded for this date.'
          : !energyGoal
            ? input.showPlannedNutrition === false
              ? 'Confirmed calories are shown without a configured goal comparison.'
              : 'Confirmed and planned calories are shown without a configured goal comparison.'
            : confirmedRemaining! < 0
              ? `Confirmed intake is ${Math.abs(confirmedRemaining!).toFixed(0)} kcal above this ${energyGoal.kind} boundary.`
              : confirmedRemaining === 0
                ? `Confirmed intake is within this ${energyGoal.kind} boundary.`
                : `${confirmedRemaining!.toFixed(0)} kcal remains to this ${energyGoal.kind} boundary based on confirmed intake only.`,
  };

  const macro = macroEnergyDistribution(input.confirmed as NutrientAmounts);
  const macroComposition = macro
    ? {
        status: 'ready' as const,
        profileLabel: input.profileLabel,
        date: input.date,
        calculatedKcal: macro.calculatedKcal,
        items: macro.items.map((item) => ({
          ...item,
          visualPercent: Math.min(100, Math.max(0, item.percentOfCalculatedEnergy)),
        })),
        takeaway: 'Percentages use calculated macro energy; grams remain visible for context.',
      }
    : {
        status: 'incomplete' as const,
        profileLabel: input.profileLabel,
        date: input.date,
        calculatedKcal: null,
        items: [],
        takeaway:
          'Protein, carbohydrate, and total fat must all be recorded before composition is shown.',
      };

  const coverage = input.goals
    .filter(
      (goal) =>
        current(goal, input.date) &&
        (!visibleNutrientCodes || visibleNutrientCodes.has(goal.nutrientCode)),
    )
    .map((goal) => {
      const amount = input.confirmed[goal.nutrientCode] ?? null;
      const resolved = nutritionGoalComparison(input.goals, input.date, goal.nutrientCode, amount);
      const ambiguous = resolved.status === 'ambiguous_goal';
      const denominator = boundary(goal);
      const ratio =
        ambiguous || amount === null || denominator === null ? null : amount / denominator;
      const status = ambiguous
        ? ('ambiguous_goal' as const)
        : amount === null
          ? ('no_data' as const)
          : goal.kind === 'range'
            ? amount < goal.minimum!
              ? ('below' as const)
              : amount > goal.maximum!
                ? ('above' as const)
                : ('within' as const)
            : goal.kind === 'limit'
              ? amount > goal.maximum!
                ? ('above' as const)
                : ('within' as const)
              : amount < goal.value!
                ? ('below' as const)
                : ('met' as const);
      const comparison = resolved.description;
      return {
        id: goal.id,
        nutrientCode: goal.nutrientCode,
        kind: goal.kind,
        sourceType: goal.sourceType,
        unit: goal.unit,
        amount,
        minimum: goal.minimum,
        maximum: goal.maximum,
        value: goal.value,
        ratio,
        visualPercent: ratio === null ? 0 : Math.min(100, Math.max(0, ratio * 100)),
        status,
        comparison,
      };
    });

  const comparisons = Object.fromEntries(
    [
      ...new Set([
        'energy_kcal',
        'protein',
        'carbohydrate',
        'total_fat',
        ...input.goals.map((goal) => goal.nutrientCode),
        ...Object.keys(input.confirmed),
      ]),
    ].map((code) => [
      code,
      nutritionGoalComparison(input.goals, input.date, code, input.confirmed[code] ?? null),
    ]),
  );
  calorie.takeaway = `${comparisons.energy_kcal!.description} Comparisons are based on confirmed intake only.`;
  return { calorie, macroComposition, coverage, comparisons };
}

export type NutritionChartDatasets = ReturnType<typeof buildNutritionChartDatasets>;
