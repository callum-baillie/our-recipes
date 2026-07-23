import { describe, expect, it } from 'vitest';

import {
  authorizeNutritionProfileAccess,
  bodyMeasurementInputSchema,
  nutritionGoalVersionInputSchema,
  nutritionProfileInputSchema,
  nutritionProfileSettingsInputSchema,
  type NutritionPermissionGrant,
} from '@/lib/domain/nutrition-profile';

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000';
const VIEWER_ID = '123e4567-e89b-42d3-a456-426614174001';

function baseProfile() {
  return { displayName: 'Household member' };
}

function viewerGrant(overrides: Partial<NutritionPermissionGrant> = {}): NutritionPermissionGrant {
  return {
    principalId: VIEWER_ID,
    role: 'viewer',
    canViewDiary: false,
    canViewMeasurements: false,
    canManageProfile: false,
    canManageGoals: false,
    canViewComparison: false,
    canExportData: false,
    canDeleteData: false,
    expiresAt: null,
    ...overrides,
  };
}

describe('Nutrition profile validation', () => {
  it('allows manual use without sensitive profile information', () => {
    const profile = nutritionProfileInputSchema.parse(baseProfile());
    expect(profile).toMatchObject({
      displayName: 'Household member',
      dateOfBirth: null,
      heightCentimeters: null,
      currentWeightKilograms: null,
      referenceSexCategory: null,
      activityLevel: null,
      estimatedTargetsEnabled: false,
      comparisonVisibility: 'hidden',
      diaryVisibility: 'private',
      visibleNutrientCodes: [
        'fiber',
        'calcium',
        'iron',
        'potassium',
        'vitamin_d',
        'sodium',
        'added_sugars',
        'saturated_fat',
      ],
      trendRangeDays: 7,
      showPlannedNutrition: true,
      showRecipeCardNutrition: true,
      recipeCardNutrientCodes: ['energy_kcal', 'protein', 'fiber'],
      showMealPlanNutrition: true,
    });
  });

  it('requires explicit consent and formula inputs only when estimated targets are enabled', () => {
    const withoutInputs = nutritionProfileInputSchema.safeParse({
      ...baseProfile(),
      estimatedTargetsEnabled: true,
    });
    expect(withoutInputs.success).toBe(false);
    if (!withoutInputs.success) {
      expect(withoutInputs.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          'estimatedTargetConsent',
          'dateOfBirth',
          'heightCentimeters',
          'currentWeightKilograms',
          'referenceSexCategory',
          'activityLevel',
        ]),
      );
    }
    expect(
      nutritionProfileInputSchema.safeParse({
        ...baseProfile(),
        estimatedTargetsEnabled: true,
        estimatedTargetConsent: true,
        dateOfBirth: '1990-01-01',
        heightCentimeters: 175,
        currentWeightKilograms: 70,
        referenceSexCategory: 'female',
        activityLevel: 'moderate',
      }).success,
    ).toBe(true);
  });

  it('retains explicitly entered life stage and dietary facts without inferring them', () => {
    const profile = nutritionProfileInputSchema.parse({
      ...baseProfile(),
      explicitlyEnteredLifeStage: 'breastfeeding',
      dietaryPreferences: ['Vegetarian', 'vegetarian', 'High protein'],
      foodAllergies: ['Peanuts'],
      dietaryExclusions: ['Alcohol'],
    });
    expect(profile.explicitlyEnteredLifeStage).toBe('breastfeeding');
    expect(profile.dietaryPreferences).toEqual(['Vegetarian', 'High protein']);
    expect(profile.foodAllergies).toEqual(['Peanuts']);
    expect(profile.dietaryExclusions).toEqual(['Alcohol']);
  });

  it('rejects invalid physical values and unbounded sensitive lists', () => {
    expect(
      nutritionProfileInputSchema.safeParse({ ...baseProfile(), heightCentimeters: -1 }).success,
    ).toBe(false);
    expect(
      nutritionProfileInputSchema.safeParse({ ...baseProfile(), currentWeightKilograms: 1_001 })
        .success,
    ).toBe(false);
    expect(
      nutritionProfileInputSchema.safeParse({ ...baseProfile(), foodAllergies: ['x'.repeat(121)] })
        .success,
    ).toBe(false);
  });

  it('validates and deduplicates bounded display preferences', () => {
    const profile = nutritionProfileInputSchema.parse({
      ...baseProfile(),
      visibleNutrientCodes: ['fiber', 'fiber', 'sodium'],
      trendRangeDays: 30,
      showPlannedNutrition: false,
      showRecipeCardNutrition: false,
      recipeCardNutrientCodes: ['carbohydrate', 'total_fat'],
      showMealPlanNutrition: false,
    });
    expect(profile.visibleNutrientCodes).toEqual(['fiber', 'sodium']);
    expect(profile.trendRangeDays).toBe(30);
    expect(profile.showPlannedNutrition).toBe(false);
    expect(profile.showRecipeCardNutrition).toBe(false);
    expect(profile.recipeCardNutrientCodes).toEqual(['carbohydrate', 'total_fat']);
    expect(profile.showMealPlanNutrition).toBe(false);
    expect(
      nutritionProfileInputSchema.safeParse({
        ...baseProfile(),
        visibleNutrientCodes: [],
      }).success,
    ).toBe(false);
    for (const recipeCardNutrientCodes of [
      [],
      ['protein', 'protein'],
      ['energy_kcal', 'protein', 'carbohydrate', 'total_fat', 'fiber', 'sodium'],
      ['vitamin_d'],
    ]) {
      expect(
        nutritionProfileInputSchema.safeParse({ ...baseProfile(), recipeCardNutrientCodes })
          .success,
      ).toBe(false);
    }
    expect(
      nutritionProfileInputSchema.safeParse({ ...baseProfile(), trendRangeDays: 21 }).success,
    ).toBe(false);
    expect(
      nutritionProfileInputSchema.safeParse({
        ...baseProfile(),
        visibleNutrientCodes: ['not_a_nutrient'],
      }).success,
    ).toBe(false);
  });

  it('accepts only Nutrition settings and rejects header identity or dormant visibility fields', () => {
    expect(
      nutritionProfileSettingsInputSchema.parse({ dailyResetTimezone: 'America/Los_Angeles' }),
    ).toMatchObject({
      dailyResetTimezone: 'America/Los_Angeles',
      showRecipeCardNutrition: true,
    });
    for (const forbidden of [
      { displayName: 'Browser override' },
      { avatarUrl: 'https://example.com/avatar.png' },
      { linkedHouseholdProfileId: OWNER_ID },
      { profileType: 'guest' },
      { comparisonVisibility: 'hidden' },
      { diaryVisibility: 'private' },
    ]) {
      expect(nutritionProfileSettingsInputSchema.safeParse(forbidden).success).toBe(false);
    }
  });
});

describe('versioned Nutrition goals and measurements', () => {
  const baseGoal = {
    nutrientCode: 'protein' as const,
    unit: 'g',
    sourceType: 'user_defined' as const,
    startsOn: '2026-07-18',
  };

  it.each([
    { ...baseGoal, kind: 'target', value: 100 },
    { ...baseGoal, kind: 'minimum', value: 25 },
    { ...baseGoal, kind: 'range', minimum: 45, maximum: 65 },
    { ...baseGoal, kind: 'limit', maximum: 80 },
  ])('accepts a valid $kind goal version', (goal) => {
    expect(nutritionGoalVersionInputSchema.safeParse(goal).success).toBe(true);
  });

  it('keeps reference-derived targets linked to a reference row', () => {
    expect(
      nutritionGoalVersionInputSchema.safeParse({
        ...baseGoal,
        sourceType: 'reference',
        kind: 'target',
        value: 100,
      }).success,
    ).toBe(false);
    expect(
      nutritionGoalVersionInputSchema.safeParse({
        ...baseGoal,
        sourceType: 'reference',
        sourceReferenceId: 'fda-daily-values-adults-children-4-plus-retrieved-2026-07-18:protein',
        kind: 'target',
        value: 100,
      }).success,
    ).toBe(true);
  });

  it('rejects inverted ranges, non-positive values, and historical date reversal', () => {
    expect(
      nutritionGoalVersionInputSchema.safeParse({
        ...baseGoal,
        kind: 'range',
        minimum: 80,
        maximum: 40,
      }).success,
    ).toBe(false);
    expect(
      nutritionGoalVersionInputSchema.safeParse({ ...baseGoal, kind: 'limit', maximum: 0 }).success,
    ).toBe(false);
    expect(
      nutritionGoalVersionInputSchema.safeParse({
        ...baseGoal,
        kind: 'target',
        value: 50,
        endsOn: '2026-07-17',
      }).success,
    ).toBe(false);
  });

  it('supports paused and archived goal versions without rewriting prior dates', () => {
    expect(
      nutritionGoalVersionInputSchema.parse({
        ...baseGoal,
        kind: 'target',
        value: 50,
        state: 'archived',
        endsOn: '2026-08-01',
      }),
    ).toMatchObject({ state: 'archived', startsOn: '2026-07-18', endsOn: '2026-08-01' });
  });

  it('validates observed measurements and permits approximate manual records', () => {
    expect(
      bodyMeasurementInputSchema.parse({
        measuredAt: '2026-07-18T08:00:00-07:00',
        weightKilograms: 70.2,
        approximate: true,
      }),
    ).toMatchObject({ weightKilograms: 70.2, approximate: true, sourceType: 'manual' });
    expect(
      bodyMeasurementInputSchema.safeParse({
        measuredAt: 'not-a-date',
        weightKilograms: -1,
      }).success,
    ).toBe(false);
  });
});

describe('server-side Nutrition permission decisions', () => {
  const profile = { ownerPrincipalId: OWNER_ID, comparisonVisibility: 'anonymized' as const };

  it('allows the owner every action', () => {
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: OWNER_ID,
        profile,
        action: 'delete_data',
        grants: [],
      }),
    ).toEqual({ allowed: true, disclosure: 'full', reason: 'owner' });
  });

  it('denies another household principal by default', () => {
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: VIEWER_ID,
        profile,
        action: 'view_diary',
        grants: [],
      }),
    ).toEqual({ allowed: false, disclosure: 'none', reason: 'not_granted' });
  });

  it('allows only explicitly granted viewer actions', () => {
    const grant = viewerGrant({ canViewDiary: true });
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: VIEWER_ID,
        profile,
        action: 'view_diary',
        grants: [grant],
      }).allowed,
    ).toBe(true);
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: VIEWER_ID,
        profile,
        action: 'view_measurements',
        grants: [grant],
      }).allowed,
    ).toBe(false);
  });

  it('returns anonymized comparison disclosure without diary detail', () => {
    const grant = viewerGrant({ canViewComparison: true });
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: VIEWER_ID,
        profile,
        action: 'view_comparison',
        grants: [grant],
      }),
    ).toEqual({ allowed: true, disclosure: 'anonymized', reason: 'explicit_grant' });
  });

  it('allows a guardian to manage a dependent profile', () => {
    const grant = viewerGrant({ role: 'guardian' });
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: VIEWER_ID,
        profile,
        action: 'manage_goals',
        grants: [grant],
      }),
    ).toEqual({ allowed: true, disclosure: 'full', reason: 'guardian' });
  });

  it('rejects an expired grant', () => {
    const grant = viewerGrant({ canViewDiary: true, expiresAt: new Date('2026-07-18T00:00:00Z') });
    expect(
      authorizeNutritionProfileAccess({
        requesterPrincipalId: VIEWER_ID,
        profile,
        action: 'view_diary',
        grants: [grant],
        now: new Date('2026-07-19T00:00:00Z'),
      }),
    ).toEqual({ allowed: false, disclosure: 'none', reason: 'expired_grant' });
  });
});
