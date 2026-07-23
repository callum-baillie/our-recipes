import { createHash } from 'node:crypto';
import { z } from 'zod';

export const nutritionRecommendationFeedbackSchema = z
  .object({
    state: z.enum(['dismissed', 'helpful', 'not_helpful']),
    reason: z.string().trim().max(500).default(''),
    supersedesFeedbackId: z.string().uuid().nullable().default(null),
  })
  .strict();

export type RecommendationShortage = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
};

export type RecommendationCandidate = {
  recipeId: string;
  recipeTitle: string;
  calculationId: string;
  nutrientAmountPerServing: number | null;
  completeness: number;
  confidence: number;
  allergyEvidenceComplete: boolean;
  allergyConflict: boolean;
  exclusionEvidenceComplete: boolean;
  exclusionConflict: boolean;
  limitAmountsPerServing: Record<string, number | null>;
  pantryState: 'ready' | 'partial' | 'unknown';
  expiringProductNames: string[];
  shortages: RecommendationShortage[];
  pantryUnknownReasons: string[];
};

export type NutritionRecommendation = {
  key: string;
  kind: 'recurring_gap' | 'planned_gap';
  nutrientCode: string;
  goalKind: 'target' | 'minimum' | 'range';
  goalBoundary: number;
  currentAmount: number;
  gapAmount: number;
  unit: string;
  recipeId: string;
  recipeTitle: string;
  calculationId: string;
  nutrientAmountPerServing: number;
  gapCoveragePercent: number;
  completeness: number;
  confidence: number;
  pantryState: 'ready' | 'partial' | 'unknown';
  expiringProductNames: string[];
  shortages: RecommendationShortage[];
  pantryUnknownReasons: string[];
  explanation: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function nutritionRecommendationKey(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

const PANTRY_ORDER = { ready: 0, partial: 1, unknown: 2 } as const;

export function rankNutritionRecommendations(input: {
  profileId: string;
  kind: 'recurring_gap' | 'planned_gap';
  nutrientCode: string;
  goalKind: 'target' | 'minimum' | 'range';
  goalBoundary: number;
  goalVersionId: string;
  currentAmount: number;
  unit: string;
  evidenceDigest: string;
  limits: Record<string, { currentAmount: number; maximum: number }>;
  candidates: RecommendationCandidate[];
  minimumCompleteness?: number;
  minimumConfidence?: number;
  maximumResults?: number;
}): NutritionRecommendation[] {
  const gapAmount = Math.max(0, input.goalBoundary - input.currentAmount);
  if (!Number.isFinite(gapAmount) || gapAmount <= 0) return [];
  const minimumCompleteness = input.minimumCompleteness ?? 0.5;
  const minimumConfidence = input.minimumConfidence ?? 0.5;
  return input.candidates
    .flatMap((candidate): NutritionRecommendation[] => {
      if (
        candidate.nutrientAmountPerServing === null ||
        candidate.nutrientAmountPerServing <= 0 ||
        candidate.completeness < minimumCompleteness ||
        candidate.confidence < minimumConfidence ||
        !candidate.allergyEvidenceComplete ||
        candidate.allergyConflict ||
        !candidate.exclusionEvidenceComplete ||
        candidate.exclusionConflict
      )
        return [];
      const breaksLimit = Object.entries(input.limits).some(([nutrientCode, limit]) => {
        const amount = candidate.limitAmountsPerServing[nutrientCode];
        return amount === null || amount === undefined
          ? true
          : limit.currentAmount + amount > limit.maximum;
      });
      if (breaksLimit) return [];
      const gapCoveragePercent = Math.min(
        100,
        (candidate.nutrientAmountPerServing / gapAmount) * 100,
      );
      const key = nutritionRecommendationKey({
        profileId: input.profileId,
        kind: input.kind,
        nutrientCode: input.nutrientCode,
        goalVersionId: input.goalVersionId,
        evidenceDigest: input.evidenceDigest,
        calculationId: candidate.calculationId,
        pantryState: candidate.pantryState,
        shortages: candidate.shortages,
        expiringProductNames: candidate.expiringProductNames,
        pantryUnknownReasons: candidate.pantryUnknownReasons,
      });
      return [
        {
          key,
          kind: input.kind,
          nutrientCode: input.nutrientCode,
          goalKind: input.goalKind,
          goalBoundary: input.goalBoundary,
          currentAmount: input.currentAmount,
          gapAmount,
          unit: input.unit,
          recipeId: candidate.recipeId,
          recipeTitle: candidate.recipeTitle,
          calculationId: candidate.calculationId,
          nutrientAmountPerServing: candidate.nutrientAmountPerServing,
          gapCoveragePercent,
          completeness: candidate.completeness,
          confidence: candidate.confidence,
          pantryState: candidate.pantryState,
          expiringProductNames: [...candidate.expiringProductNames].sort(),
          shortages: candidate.shortages,
          pantryUnknownReasons: candidate.pantryUnknownReasons,
          explanation: `${candidate.recipeTitle} provides ${Number(candidate.nutrientAmountPerServing.toFixed(2))} ${input.unit} ${input.nutrientCode.replaceAll('_', ' ')} per calculated serving, about ${Math.round(gapCoveragePercent)}% of this ${input.kind === 'planned_gap' ? 'planned' : 'recorded-average'} gap. Pantry availability is ${candidate.pantryState}.`,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.gapCoveragePercent - left.gapCoveragePercent ||
        PANTRY_ORDER[left.pantryState] - PANTRY_ORDER[right.pantryState] ||
        right.expiringProductNames.length - left.expiringProductNames.length ||
        right.completeness - left.completeness ||
        right.confidence - left.confidence ||
        left.recipeTitle.localeCompare(right.recipeTitle) ||
        left.recipeId.localeCompare(right.recipeId),
    )
    .slice(0, input.maximumResults ?? 3);
}

export type NutritionRecommendationFeedbackInput = z.input<
  typeof nutritionRecommendationFeedbackSchema
>;
