import { z } from 'zod';

import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
  normalizeInventoryUnit,
} from '@/lib/domain/inventory-units';

export const pantryMappingInputSchema = z
  .object({
    productId: z.string().uuid(),
    compatibleVariant: z.boolean().default(false),
    isOptional: z.boolean().default(false),
  })
  .strict();

export const pantryRecipeAvailabilityQuerySchema = z.object({
  servings: z.coerce.number().positive().max(1_000).optional(),
});

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
  );
}

const isoCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine(isIsoCalendarDate, 'Use a real calendar date.');

export const pantryDemandQuerySchema = z
  .object({
    weekStart: isoCalendarDateSchema,
    weekEnd: isoCalendarDateSchema,
  })
  .refine((value) => value.weekStart <= value.weekEnd, {
    path: ['weekEnd'],
    message: 'The end date must be on or after the start date.',
  });

export type PantryAvailabilityState = 'ready' | 'partial' | 'unknown';

export type AvailabilityIngredient = {
  id: string;
  item: string;
  quantity: number | null;
  unit: string;
  productId: string | null;
  productName: string | null;
  isOptional: boolean;
};

export type AvailabilityStock = {
  batchId: string;
  productId: string;
  quantity: number | null;
  unit: string;
  approximateState: string | null;
  locationName?: string | null;
  expiryDate?: string | null;
};

export type PantryStockAllocation = {
  batchId: string;
  quantity: number | null;
  unit: string;
  locationName: string | null;
  expiryDate: string | null;
  exact: boolean;
};

export type PantryIngredientAvailability = AvailabilityIngredient & {
  state: PantryAvailabilityState;
  requiredQuantity: number | null;
  availableQuantity: number | null;
  shortageQuantity: number | null;
  plannedCommittedQuantity: number | null;
  projectedRemainderQuantity: number | null;
  earliestExpiryDate: string | null;
  matchingBatches: PantryStockAllocation[];
  reason: string;
};

export type PantryRecipeAvailability = {
  recipeId: string;
  recipeTitle: string;
  baseServings: number | null;
  targetServings: number | null;
  state: PantryAvailabilityState;
  ingredients: PantryIngredientAvailability[];
  counts: Record<PantryAvailabilityState, number>;
};

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function allocateExactStock(
  ingredient: AvailabilityIngredient,
  stock: AvailabilityStock[],
  remainingByBatchId: Map<string, number>,
  requiredQuantity: number,
): { quantity: number; uncertain: boolean; matchingBatches: PantryStockAllocation[] } {
  let quantity = 0;
  let uncertain = false;
  const matchingBatches = stock
    .filter((batch) => batch.productId === ingredient.productId)
    .map((batch) => ({
      batchId: batch.batchId,
      quantity: batch.quantity,
      unit: batch.unit,
      locationName: batch.locationName ?? null,
      expiryDate: batch.expiryDate ?? null,
      exact:
        batch.quantity !== null &&
        batch.approximateState === null &&
        areInventoryUnitsCompatible(batch.unit, ingredient.unit),
    }));
  for (const batch of stock) {
    if (batch.productId !== ingredient.productId) continue;
    if (batch.quantity === null || batch.approximateState !== null) {
      uncertain = true;
      continue;
    }
    if (!areInventoryUnitsCompatible(batch.unit, ingredient.unit)) {
      uncertain = true;
      continue;
    }
    quantity += convertInventoryQuantity(
      remainingByBatchId.get(batch.batchId) ?? batch.quantity,
      batch.unit,
      ingredient.unit,
    );
  }
  let quantityToAllocate = Math.min(quantity, requiredQuantity);
  for (const batch of stock) {
    if (
      quantityToAllocate <= 0 ||
      batch.productId !== ingredient.productId ||
      batch.quantity === null ||
      batch.approximateState !== null ||
      !areInventoryUnitsCompatible(batch.unit, ingredient.unit)
    )
      continue;
    const remaining = remainingByBatchId.get(batch.batchId) ?? batch.quantity;
    const remainingInIngredientUnit = convertInventoryQuantity(
      remaining,
      batch.unit,
      ingredient.unit,
    );
    const allocated = Math.min(remainingInIngredientUnit, quantityToAllocate);
    remainingByBatchId.set(
      batch.batchId,
      rounded(remaining - convertInventoryQuantity(allocated, ingredient.unit, batch.unit)),
    );
    quantityToAllocate = rounded(quantityToAllocate - allocated);
  }
  return { quantity: rounded(quantity), uncertain, matchingBatches };
}

export function calculateRecipeAvailability(input: {
  recipeId: string;
  recipeTitle: string;
  baseServings: number | null;
  targetServings?: number;
  ingredients: AvailabilityIngredient[];
  stock: AvailabilityStock[];
  plannedCommitments?: Array<{ productId: string; quantity: number; unit: string }>;
}): PantryRecipeAvailability {
  const targetServings = input.targetServings ?? input.baseServings;
  const multiplier =
    input.baseServings && targetServings ? targetServings / input.baseServings : null;
  const remainingByBatchId = new Map<string, number>();
  const ingredients = new Array<PantryIngredientAvailability>(input.ingredients.length);
  const allocationOrder = input.ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .sort(
      (left, right) => Number(left.ingredient.isOptional) - Number(right.ingredient.isOptional),
    );
  for (const { ingredient, index } of allocationOrder) {
    if (!ingredient.productId) {
      ingredients[index] = {
        ...ingredient,
        state: 'unknown',
        requiredQuantity: null,
        availableQuantity: null,
        shortageQuantity: null,
        plannedCommittedQuantity: null,
        projectedRemainderQuantity: null,
        earliestExpiryDate: null,
        matchingBatches: [],
        reason: 'Not mapped to a Pantry product.',
      };
      continue;
    }
    if (ingredient.quantity === null) {
      ingredients[index] = {
        ...ingredient,
        state: 'unknown',
        requiredQuantity: null,
        availableQuantity: null,
        shortageQuantity: null,
        plannedCommittedQuantity: null,
        projectedRemainderQuantity: null,
        earliestExpiryDate: null,
        matchingBatches: [],
        reason: 'The recipe does not specify an exact quantity.',
      };
      continue;
    }
    if (!ingredient.unit.trim()) {
      ingredients[index] = {
        ...ingredient,
        state: 'unknown',
        requiredQuantity: null,
        availableQuantity: null,
        shortageQuantity: null,
        plannedCommittedQuantity: null,
        projectedRemainderQuantity: null,
        earliestExpiryDate: null,
        matchingBatches: [],
        reason: 'The recipe does not specify a unit.',
      };
      continue;
    }
    if (multiplier === null) {
      ingredients[index] = {
        ...ingredient,
        state: 'unknown',
        requiredQuantity: null,
        availableQuantity: null,
        shortageQuantity: null,
        plannedCommittedQuantity: null,
        projectedRemainderQuantity: null,
        earliestExpiryDate: null,
        matchingBatches: [],
        reason: 'The recipe serving yield cannot be scaled exactly.',
      };
      continue;
    }
    const requiredQuantity = rounded(ingredient.quantity * multiplier);
    const available = allocateExactStock(
      ingredient,
      input.stock,
      remainingByBatchId,
      requiredQuantity,
    );
    const plannedCommittedQuantity = rounded(
      (input.plannedCommitments ?? [])
        .filter(
          (commitment) =>
            commitment.productId === ingredient.productId &&
            areInventoryUnitsCompatible(commitment.unit, ingredient.unit),
        )
        .reduce(
          (total, commitment) =>
            total + convertInventoryQuantity(commitment.quantity, commitment.unit, ingredient.unit),
          0,
        ),
    );
    const exactExpiries = available.matchingBatches
      .filter((batch) => batch.exact && batch.expiryDate)
      .map((batch) => batch.expiryDate!)
      .sort();
    const shared = {
      plannedCommittedQuantity,
      projectedRemainderQuantity: rounded(
        available.quantity - requiredQuantity - plannedCommittedQuantity,
      ),
      earliestExpiryDate: exactExpiries[0] ?? null,
      matchingBatches: available.matchingBatches,
    };
    if (available.quantity >= requiredQuantity) {
      ingredients[index] = {
        ...ingredient,
        state: 'ready',
        requiredQuantity,
        availableQuantity: available.quantity,
        shortageQuantity: 0,
        ...shared,
        reason: 'Compatible exact Pantry stock covers this amount.',
      };
      continue;
    }
    if (available.uncertain) {
      ingredients[index] = {
        ...ingredient,
        state: 'unknown',
        requiredQuantity,
        availableQuantity: available.quantity,
        shortageQuantity: null,
        ...shared,
        reason:
          'Compatible exact stock is insufficient, and approximate or incompatible stock cannot be counted exactly.',
      };
      continue;
    }
    ingredients[index] = {
      ...ingredient,
      state: 'partial',
      requiredQuantity,
      availableQuantity: available.quantity,
      shortageQuantity: rounded(requiredQuantity - available.quantity),
      ...shared,
      reason: 'Compatible exact Pantry stock does not cover this amount.',
    };
  }
  const required = ingredients.filter((ingredient) => !ingredient.isOptional);
  const state: PantryAvailabilityState = required.some(
    (ingredient) => ingredient.state === 'partial',
  )
    ? 'partial'
    : required.some((ingredient) => ingredient.state === 'unknown')
      ? 'unknown'
      : 'ready';
  return {
    recipeId: input.recipeId,
    recipeTitle: input.recipeTitle,
    baseServings: input.baseServings,
    targetServings,
    state,
    ingredients,
    counts: {
      ready: ingredients.filter((ingredient) => ingredient.state === 'ready').length,
      partial: ingredients.filter((ingredient) => ingredient.state === 'partial').length,
      unknown: ingredients.filter((ingredient) => ingredient.state === 'unknown').length,
    },
  };
}

export type PantryDemandRequirement = {
  mealPlanEntryId: string;
  plannedFor: string;
  recipeId: string;
  recipeTitle: string;
  ingredientId: string;
  ingredientName: string;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  unit: string;
  reason: string | null;
};

export type PantryDemandLine = {
  productId: string;
  productName: string;
  unit: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortageQuantity: number | null;
  state: 'covered' | 'shortage' | 'uncertain';
  uncertaintyReason: string | null;
  projectedRemainderQuantity: number | null;
  exhaustionDate: string | null;
  earliestExpiryDate: string | null;
  expiryConflicts: Array<{ batchId: string; expiryDate: string; plannedFor: string }>;
  meals: Array<{ mealPlanEntryId: string; plannedFor: string; recipeTitle: string }>;
};

export type PantryProjectedDemand = {
  weekStart: string;
  weekEnd: string;
  lines: PantryDemandLine[];
  unknown: PantryDemandRequirement[];
};

export function calculateProjectedDemand(input: {
  weekStart: string;
  weekEnd: string;
  requirements: PantryDemandRequirement[];
  stock: AvailabilityStock[];
}): PantryProjectedDemand {
  const unknown = input.requirements.filter(
    (requirement) =>
      requirement.reason !== null ||
      requirement.productId === null ||
      requirement.quantity === null ||
      !requirement.unit.trim(),
  );
  const exact = input.requirements.filter(
    (requirement) =>
      requirement.reason === null &&
      requirement.productId !== null &&
      requirement.quantity !== null &&
      requirement.unit.trim(),
  );
  const groups: Array<{
    productId: string;
    productName: string;
    unit: string;
    requirements: PantryDemandRequirement[];
  }> = [];
  for (const requirement of exact) {
    const group = groups.find(
      (candidate) =>
        candidate.productId === requirement.productId &&
        areInventoryUnitsCompatible(candidate.unit, requirement.unit),
    );
    if (group) group.requirements.push(requirement);
    else
      groups.push({
        productId: requirement.productId!,
        productName: requirement.productName!,
        unit: normalizeInventoryUnit(requirement.unit),
        requirements: [requirement],
      });
  }
  const countedBatchIds = new Set<string>();
  const lines = groups.map<PantryDemandLine>((group) => {
    const requiredQuantity = rounded(
      group.requirements.reduce(
        (total, requirement) =>
          total + convertInventoryQuantity(requirement.quantity!, requirement.unit, group.unit),
        0,
      ),
    );
    let availableQuantity = 0;
    let uncertainStock = false;
    for (const batch of input.stock) {
      if (batch.productId !== group.productId) continue;
      if (
        batch.quantity === null ||
        batch.approximateState !== null ||
        !areInventoryUnitsCompatible(batch.unit, group.unit)
      ) {
        uncertainStock = true;
        continue;
      }
      if (countedBatchIds.has(batch.batchId)) continue;
      availableQuantity += convertInventoryQuantity(batch.quantity, batch.unit, group.unit);
      countedBatchIds.add(batch.batchId);
    }
    availableQuantity = rounded(availableQuantity);
    const chronological = [...group.requirements].sort(
      (left, right) =>
        left.plannedFor.localeCompare(right.plannedFor) ||
        left.mealPlanEntryId.localeCompare(right.mealPlanEntryId),
    );
    let runningDemand = 0;
    let exhaustionDate: string | null = null;
    for (const requirement of chronological) {
      runningDemand = rounded(
        runningDemand +
          convertInventoryQuantity(requirement.quantity!, requirement.unit, group.unit),
      );
      if (!exhaustionDate && runningDemand > availableQuantity)
        exhaustionDate = requirement.plannedFor;
    }
    const productStock = input.stock.filter(
      (batch) =>
        batch.productId === group.productId &&
        batch.quantity !== null &&
        batch.approximateState === null &&
        areInventoryUnitsCompatible(batch.unit, group.unit),
    );
    const expiryDates = productStock
      .flatMap((batch) => (batch.expiryDate ? [batch.expiryDate] : []))
      .sort();
    const expiryConflicts = chronological.flatMap((requirement) =>
      productStock.flatMap((batch) =>
        batch.expiryDate && batch.expiryDate < requirement.plannedFor
          ? [
              {
                batchId: batch.batchId,
                expiryDate: batch.expiryDate,
                plannedFor: requirement.plannedFor,
              },
            ]
          : [],
      ),
    );
    const isCovered = availableQuantity >= requiredQuantity;
    const isUncertain = !isCovered && uncertainStock;
    return {
      productId: group.productId,
      productName: group.productName,
      unit: group.unit,
      requiredQuantity,
      availableQuantity,
      shortageQuantity: isUncertain
        ? null
        : rounded(Math.max(0, requiredQuantity - availableQuantity)),
      state: isCovered ? 'covered' : isUncertain ? 'uncertain' : 'shortage',
      uncertaintyReason: isUncertain
        ? 'Exact compatible stock is insufficient; approximate or incompatible stock may change the shortage.'
        : null,
      projectedRemainderQuantity: isUncertain
        ? null
        : rounded(availableQuantity - requiredQuantity),
      exhaustionDate,
      earliestExpiryDate: expiryDates[0] ?? null,
      expiryConflicts,
      meals: group.requirements.map(({ mealPlanEntryId, plannedFor, recipeTitle }) => ({
        mealPlanEntryId,
        plannedFor,
        recipeTitle,
      })),
    };
  });
  return { weekStart: input.weekStart, weekEnd: input.weekEnd, lines, unknown };
}

export type PantryMappingInput = z.output<typeof pantryMappingInputSchema>;
