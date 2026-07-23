import { describe, expect, it } from 'vitest';

import {
  auditNutritionHouseholdLinks,
  NutritionHouseholdLinkConflictError,
} from '@/lib/domain/nutrition-household';

describe('Nutrition household link audit', () => {
  const link = (
    overrides: Partial<Parameters<typeof auditNutritionHouseholdLinks>[1][number]> = {},
  ) => ({
    nutritionProfileId: 'nutrition-one',
    householdProfileId: 'household-one',
    ownerPrincipalId: 'principal-one',
    archivedAt: null,
    ...overrides,
  });

  it('identifies only wholly missing unambiguous household links', () => {
    const result = auditNutritionHouseholdLinks(['household-one', 'household-two'], [link()]);
    expect(result.missingHouseholdProfileIds).toEqual(['household-two']);
    expect(result.linkedByHouseholdProfileId.get('household-one')?.nutritionProfileId).toBe(
      'nutrition-one',
    );
  });

  it.each(
    [
      [link({ householdProfileId: null })],
      [link({ householdProfileId: 'missing' })],
      [link({ archivedAt: new Date() })],
      [link(), link({ nutritionProfileId: 'duplicate', ownerPrincipalId: 'principal-two' })],
      [
        link(),
        link({
          nutritionProfileId: 'nutrition-two',
          householdProfileId: 'household-two',
        }),
      ],
    ].map((links) => [links]),
  )('rejects ambiguous legacy link state', (links) => {
    expect(() => auditNutritionHouseholdLinks(['household-one', 'household-two'], links)).toThrow(
      NutritionHouseholdLinkConflictError,
    );
  });
});
