export const AI_PRICING_AS_OF = '2026-07-22';

const TEXT_PRICE_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2.5, output: 15 },
  'gpt-5.6-luna': { input: 1, output: 6 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
};

// The provider requests low-quality 1024x1024 GPT Image 2 output.
export const LOW_SQUARE_RECIPE_IMAGE_ESTIMATE_USD = 0.006;

export type AiMealPlanCostEstimate = {
  inputTokens: number;
  outputTokens: number;
  inputUsd: number | null;
  outputUsd: number | null;
  imageCount: number;
  imageUsd: number;
  totalUsd: number | null;
};

function inclusiveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function estimateAiMealPlanCost(input: {
  model: string;
  startDate: string;
  endDate: string;
  mealSlots: string[];
  profileCount: number;
  allowRepeatingMeals: boolean;
  planLeftovers: boolean;
  generateRecipeImages: boolean;
}): AiMealPlanCostEstimate {
  const days = inclusiveDays(input.startDate, input.endDate);
  const slotCount = Math.max(1, days * input.mealSlots.length);
  const leftoverMeals =
    input.planLeftovers && input.mealSlots.includes('dinner') && input.mealSlots.includes('lunch')
      ? Math.max(0, days - 1)
      : 0;
  const nonLeftoverMeals = Math.max(1, slotCount - leftoverMeals);
  const distinctRecipes = input.allowRepeatingMeals
    ? Math.max(1, Math.ceil(nonLeftoverMeals * 0.7))
    : nonLeftoverMeals;

  // The estimate includes bounded household context plus structured recipe output for each meal.
  const inputTokens = 1_500 + slotCount * 85 + Math.max(1, input.profileCount) * 220;
  const outputTokens = 450 + distinctRecipes * 1_000;
  const price = TEXT_PRICE_USD_PER_MILLION[input.model];
  const inputUsd = price ? (inputTokens / 1_000_000) * price.input : null;
  const outputUsd = price ? (outputTokens / 1_000_000) * price.output : null;
  const imageCount = input.generateRecipeImages ? distinctRecipes : 0;
  const imageUsd = imageCount * LOW_SQUARE_RECIPE_IMAGE_ESTIMATE_USD;

  return {
    inputTokens,
    outputTokens,
    inputUsd,
    outputUsd,
    imageCount,
    imageUsd,
    totalUsd: inputUsd === null || outputUsd === null ? null : inputUsd + outputUsd + imageUsd,
  };
}
