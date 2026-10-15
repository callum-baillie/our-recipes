export type PantryRestockMode = 'none' | 'always_have' | 'always_buy';
export type PantryRestockTrigger = 'below_target' | 'reorder_point' | 'empty';

export type PantryRestockCalculationInput = {
  mode: PantryRestockMode;
  trigger: PantryRestockTrigger;
  recipeRequirement: number;
  usablePantry: number;
  pendingCoverage?: number;
  purchasedCoverage?: number;
  manualExtra?: number;
  targetStock?: number | null;
  reorderThreshold?: number | null;
  purchaseIncrement?: number | null;
  stockCertain?: boolean;
};

export type PantryRestockCalculation = {
  needsReview: boolean;
  reviewReason: string | null;
  triggered: boolean;
  projectedRemainder: number | null;
  recipeShortage: number | null;
  policyContribution: number | null;
  unroundedPurchaseGoal: number | null;
  roundedPurchaseGoal: number | null;
  remainingToBuy: number | null;
};

function finiteNonNegative(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundQuantity(value: number): number {
  return Number(Math.max(0, value).toFixed(6));
}

function roundSignedQuantity(value: number): number {
  return Number(value.toFixed(6));
}

export function roundUpToPurchaseIncrement(value: number, increment: number | null | undefined) {
  const normalized = finiteNonNegative(increment);
  if (!normalized) return roundQuantity(value);
  return roundQuantity(Math.ceil((value - 1e-9) / normalized) * normalized);
}

export function calculatePantryRestock(
  input: PantryRestockCalculationInput,
): PantryRestockCalculation {
  const recipeRequirement = finiteNonNegative(input.recipeRequirement);
  const usablePantry = finiteNonNegative(input.usablePantry);
  const pendingCoverage = finiteNonNegative(input.pendingCoverage);
  const purchasedCoverage = finiteNonNegative(input.purchasedCoverage);
  const manualExtra = finiteNonNegative(input.manualExtra);
  const availableForPlan = usablePantry + pendingCoverage;
  const projectedRemainder = roundSignedQuantity(availableForPlan - recipeRequirement);
  const recipeShortage = roundQuantity(Math.max(0, recipeRequirement - availableForPlan));
  const stockCertain = input.stockCertain !== false;

  if (input.mode === 'always_have' && !stockCertain) {
    return {
      needsReview: true,
      reviewReason:
        'Pantry stock is approximate, excluded, or uses an incompatible unit. Confirm stock before adding a purchase quantity.',
      triggered: false,
      projectedRemainder: null,
      recipeShortage: null,
      policyContribution: null,
      unroundedPurchaseGoal: null,
      roundedPurchaseGoal: null,
      remainingToBuy: null,
    };
  }

  let triggered = false;
  let totalGoal = recipeShortage;
  let policyContribution = 0;

  if (input.mode === 'always_have') {
    const target = finiteNonNegative(input.targetStock);
    if (input.trigger === 'below_target') triggered = projectedRemainder < target;
    if (input.trigger === 'reorder_point') {
      triggered = projectedRemainder <= finiteNonNegative(input.reorderThreshold);
    }
    if (input.trigger === 'empty') triggered = projectedRemainder <= 0;
    if (triggered) {
      totalGoal = roundQuantity(Math.max(0, recipeRequirement + target - availableForPlan));
      policyContribution = roundQuantity(Math.max(0, totalGoal - recipeShortage));
    }
  } else if (input.mode === 'always_buy') {
    const baseline = finiteNonNegative(input.purchaseIncrement);
    totalGoal = roundQuantity(Math.max(baseline, recipeShortage));
    policyContribution = roundQuantity(Math.max(0, totalGoal - recipeShortage));
    triggered = baseline > 0;
  }

  const unroundedPurchaseGoal = roundQuantity(totalGoal + manualExtra);
  const roundedPurchaseGoal = roundUpToPurchaseIncrement(
    unroundedPurchaseGoal,
    input.purchaseIncrement,
  );
  const remainingToBuy = roundQuantity(Math.max(0, roundedPurchaseGoal - purchasedCoverage));

  return {
    needsReview: input.mode === 'always_buy' && !stockCertain,
    reviewReason:
      input.mode === 'always_buy' && !stockCertain
        ? 'The recurring amount is included, but Pantry stock is uncertain and recipe demand may require more.'
        : null,
    triggered,
    projectedRemainder,
    recipeShortage,
    policyContribution,
    unroundedPurchaseGoal,
    roundedPurchaseGoal,
    remainingToBuy,
  };
}
