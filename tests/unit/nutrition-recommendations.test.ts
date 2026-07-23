import { describe, expect, it } from 'vitest';

import {
  nutritionRecommendationFeedbackSchema,
  nutritionRecommendationKey,
  rankNutritionRecommendations,
  type RecommendationCandidate,
} from '@/lib/domain/nutrition-recommendations';

const baseCandidate: RecommendationCandidate = {
  recipeId: 'recipe-a',
  recipeTitle: 'Lentil soup',
  calculationId: 'calculation-a',
  nutrientAmountPerServing: 8,
  completeness: 0.8,
  confidence: 0.9,
  allergyEvidenceComplete: true,
  allergyConflict: false,
  exclusionEvidenceComplete: true,
  exclusionConflict: false,
  limitAmountsPerServing: { sodium: 200 },
  pantryState: 'ready',
  expiringProductNames: ['Lentils'],
  shortages: [],
  pantryUnknownReasons: [],
};

function rank(candidates: RecommendationCandidate[], currentAmount = 10) {
  return rankNutritionRecommendations({
    profileId: 'profile',
    kind: 'recurring_gap',
    nutrientCode: 'fiber',
    goalKind: 'minimum',
    goalBoundary: 30,
    goalVersionId: 'goal-v1',
    currentAmount,
    unit: 'g',
    evidenceDigest: 'evidence',
    limits: { sodium: { currentAmount: 1_000, maximum: 2_300 } },
    candidates,
  });
}

describe('deterministic Nutrition recommendations', () => {
  it('shows transparent gap coverage and orders lexicographically without an opaque score', () => {
    const rows = rank([
      { ...baseCandidate, recipeId: 'b', calculationId: 'b', nutrientAmountPerServing: 5 },
      { ...baseCandidate, recipeId: 'a', calculationId: 'a', nutrientAmountPerServing: 10 },
    ]);
    expect(rows.map((row) => row.recipeId)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ gapAmount: 20, gapCoveragePercent: 50 });
    expect(rows[0]!.explanation).toContain('10 g fiber per calculated serving');
  });

  it('suppresses low-quality, unresolved-allergy, conflicting and limit-breaking candidates', () => {
    expect(rank([{ ...baseCandidate, completeness: 0.49 }])).toEqual([]);
    expect(rank([{ ...baseCandidate, allergyEvidenceComplete: false }])).toEqual([]);
    expect(rank([{ ...baseCandidate, allergyConflict: true }])).toEqual([]);
    expect(rank([{ ...baseCandidate, exclusionEvidenceComplete: false }])).toEqual([]);
    expect(rank([{ ...baseCandidate, exclusionConflict: true }])).toEqual([]);
    expect(rank([{ ...baseCandidate, limitAmountsPerServing: { sodium: 1_301 } }])).toEqual([]);
    expect(rank([{ ...baseCandidate, limitAmountsPerServing: { sodium: null } }])).toEqual([]);
    expect(rank([baseCandidate], 30)).toEqual([]);
  });

  it('creates stable evidence keys and validates strict feedback', () => {
    expect(nutritionRecommendationKey({ b: 2, a: 1 })).toBe(
      nutritionRecommendationKey({ a: 1, b: 2 }),
    );
    expect(nutritionRecommendationKey({ a: 1 })).not.toBe(nutritionRecommendationKey({ a: 2 }));
    expect(nutritionRecommendationFeedbackSchema.parse({ state: 'dismissed' })).toMatchObject({
      state: 'dismissed',
      supersedesFeedbackId: null,
    });
    expect(nutritionRecommendationFeedbackSchema.safeParse({ state: 'diagnose' }).success).toBe(
      false,
    );
  });
});
