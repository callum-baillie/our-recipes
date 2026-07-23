export type InsightGoal = {
  nutrientCode: string;
  kind: 'target' | 'minimum' | 'range' | 'limit';
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  sourceType: 'user_defined' | 'clinician_defined' | 'reference';
};

export type GoalInsight = {
  nutrientCode: string;
  status: 'below' | 'within' | 'above' | 'no_data' | 'insufficient_data';
  percentOfGoal: number | null;
  message: string;
};

export type NutritionSuggestion = {
  nutrientCode: string;
  tone: 'consider_more' | 'consider_less';
  message: string;
};

const FOOD_IDEAS: Record<string, string> = {
  protein: 'beans, lentils, eggs, fish, tofu, dairy, or another protein-rich food you enjoy',
  fiber: 'beans, whole grains, fruit, vegetables, nuts, or seeds',
  iron: 'beans, lentils, fortified grains, meat, shellfish, or leafy greens',
  calcium: 'dairy, fortified alternatives, tofu, canned fish with bones, or leafy greens',
  potassium: 'beans, potatoes, squash, yogurt, bananas, or leafy greens',
  vitamin_c: 'citrus, berries, peppers, broccoli, or tomatoes',
  vitamin_d: 'fortified foods, eggs, or fatty fish',
  folate: 'beans, leafy greens, avocado, citrus, or fortified grains',
};

function goalBoundary(goal: InsightGoal): number | null {
  if (goal.kind === 'target' || goal.kind === 'minimum') return goal.value;
  if (goal.kind === 'limit') return goal.maximum;
  return goal.minimum;
}

export function evaluateNutritionInsights(input: {
  dailyAverages: Readonly<Record<string, number>>;
  goals: readonly InsightGoal[];
  observedDays: number;
  coverageByNutrient: Readonly<Record<string, number>>;
  minimumDays?: number;
  minimumCoverage?: number;
}): { goals: GoalInsight[]; suggestions: NutritionSuggestion[]; qualityMessage: string } {
  const minimumDays = input.minimumDays ?? 3;
  const minimumCoverage = input.minimumCoverage ?? 0.5;
  const goals = input.goals.map((goal): GoalInsight => {
    const amount = input.dailyAverages[goal.nutrientCode];
    const boundary = goalBoundary(goal);
    if (amount === undefined || boundary === null) {
      return {
        nutrientCode: goal.nutrientCode,
        status: 'no_data',
        percentOfGoal: null,
        message: 'No comparable nutrient value is recorded.',
      };
    }
    const percentOfGoal = amount / boundary;
    const adequate =
      input.observedDays >= minimumDays &&
      (input.coverageByNutrient[goal.nutrientCode] ?? 0) >= minimumCoverage;
    if (!adequate) {
      return {
        nutrientCode: goal.nutrientCode,
        status: 'insufficient_data',
        percentOfGoal,
        message: 'More complete diary days are needed before showing a pattern.',
      };
    }
    let status: GoalInsight['status'];
    if (goal.kind === 'limit') status = amount > goal.maximum! ? 'above' : 'within';
    else if (goal.kind === 'range') {
      status = amount < goal.minimum! ? 'below' : amount > goal.maximum! ? 'above' : 'within';
    } else status = amount < goal.value! ? 'below' : 'within';
    return {
      nutrientCode: goal.nutrientCode,
      status,
      percentOfGoal,
      message:
        status === 'within'
          ? 'The recorded average is within this goal boundary.'
          : status === 'below'
            ? 'The recorded average is below this goal boundary.'
            : 'The recorded average is above this goal boundary.',
    };
  });
  const suggestions = goals
    .flatMap((insight): NutritionSuggestion[] => {
      if (insight.status === 'below' && FOOD_IDEAS[insight.nutrientCode]) {
        return [
          {
            nutrientCode: insight.nutrientCode,
            tone: 'consider_more',
            message: `If it fits your preferences, consider a meal with ${FOOD_IDEAS[insight.nutrientCode]}.`,
          },
        ];
      }
      if (
        insight.status === 'above' &&
        ['sodium', 'added_sugars', 'saturated_fat', 'caffeine', 'alcohol'].includes(
          insight.nutrientCode,
        )
      ) {
        return [
          {
            nutrientCode: insight.nutrientCode,
            tone: 'consider_less',
            message: `Consider comparing recipes with a lower recorded ${insight.nutrientCode.replaceAll('_', ' ')} value.`,
          },
        ];
      }
      return [];
    })
    .slice(0, 3);
  const anyAdequate = Object.values(input.coverageByNutrient).some(
    (coverage) => coverage >= minimumCoverage,
  );
  return {
    goals,
    suggestions,
    qualityMessage:
      input.observedDays >= minimumDays && anyAdequate
        ? 'Each pattern is shown only when that nutrient has enough recorded coverage.'
        : `Insights need at least ${minimumDays} recorded days and ${Math.round(minimumCoverage * 100)}% nutrient coverage.`,
  };
}
