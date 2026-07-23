import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resetDatabaseForTests } from '@/lib/db/client';
import { getDatabase } from '@/lib/db/client';
import { mealPlanEntries, nutritionMealAllocationVersions, recipes } from '@/lib/db/schema';
import { addProfile, completeSetup } from '@/lib/services/household-service';
import { createNutritionDataSource } from '@/lib/services/nutrition-foundation-service';
import { getHouseholdNutritionComparison } from '@/lib/services/nutrition-comparison-service';
import { appendNutritionIntakeRevision } from '@/lib/services/nutrition-intake-service';
import { appendNutritionGoalVersion } from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity } from './nutrition-household-fixture';

describe('privacy-preserving household Nutrition comparison', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-comparison-media');
    resetDatabaseForTests();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('uses bounded queries and normalizes target, minimum, range and limit by member-local evidence', () => {
    const household = completeSetup({
      householdName: 'Shared household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Requesting Avery',
        color: '#111111',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    });
    const householdProfiles = [
      household.profiles[0]!,
      ...['Named Morgan', 'Secret Riley', 'Hidden Taylor'].map((displayName, index) =>
        addProfile({
          displayName,
          color: `#${index + 2}${index + 2}${index + 2}${index + 2}${index + 2}${index + 2}`,
          avatarUrl: '',
          units: 'metric',
          temperatureUnit: 'C',
          locale: 'en-US',
          timezone: index === 1 ? 'Asia/Tokyo' : 'America/Los_Angeles',
        }),
      ),
    ];
    const requester = createNutritionIdentity('requester private secret', {
      displayName: 'Requesting Avery',
      comparisonVisibility: 'named',
      dailyResetTimezone: 'America/Los_Angeles',
      linkedHouseholdProfileId: householdProfiles[0]!.id,
    });
    const named = createNutritionIdentity('named private secret', {
      displayName: 'Named Morgan',
      comparisonVisibility: 'named',
      dailyResetTimezone: 'America/Los_Angeles',
      linkedHouseholdProfileId: householdProfiles[1]!.id,
    });
    const anonymous = createNutritionIdentity('anonymous private secret', {
      displayName: 'Secret Riley',
      comparisonVisibility: 'anonymized',
      dailyResetTimezone: 'Asia/Tokyo',
      linkedHouseholdProfileId: householdProfiles[2]!.id,
    });
    const hidden = createNutritionIdentity('hidden private secret', {
      displayName: 'Hidden Taylor',
      comparisonVisibility: 'hidden',
      dailyResetTimezone: 'America/Los_Angeles',
      linkedHouseholdProfileId: householdProfiles[3]!.id,
    });
    const source = createNutritionDataSource({
      id: 'manual-comparison-test',
      sourceType: 'manual',
      name: 'Comparison test record',
      provider: 'Our Recipes',
      version: '1',
    });
    const identities = [requester, named, anonymous, hidden];
    identities.forEach((identity, identityIndex) => {
      const goals = [
        { kind: 'target' as const, value: 2_000 },
        { kind: 'minimum' as const, value: 1_000 },
        { kind: 'range' as const, minimum: 1_000, maximum: 1_500 },
        { kind: 'limit' as const, maximum: 2_000 },
      ];
      appendNutritionGoalVersion(identity.profile.id, identity.principal.id, {
        nutrientCode: 'energy_kcal',
        unit: 'kcal',
        sourceType: 'user_defined',
        startsOn: '2026-07-01',
        ...goals[identityIndex]!,
      });
      if (identityIndex === 2) {
        for (const nutrientCode of ['protein', 'carbohydrate', 'fiber', 'total_fat'] as const) {
          appendNutritionGoalVersion(identity.profile.id, identity.principal.id, {
            nutrientCode,
            unit: 'g',
            sourceType: 'user_defined',
            startsOn: '2026-07-01',
            kind: 'range',
            minimum: 1_000,
            maximum: 1_500,
          });
        }
      }
      for (const [entryIndex, occurredAt] of [
        '2026-07-17T18:00:00Z',
        '2026-07-18T18:00:00Z',
        '2026-07-19T18:00:00Z',
      ].entries()) {
        appendNutritionIntakeRevision(identity.profile.id, identity.principal.id, {
          occurredAt,
          mealSlot: 'lunch',
          state: 'eaten',
          sourceType: 'manual',
          sourceNameSnapshot: 'Recorded day',
          quantity: 1,
          unit: 'day',
          provenance: {
            sourceIds: [source.id],
            sourceDetails: [
              {
                id: source.id,
                name: source.name,
                provider: source.provider,
                version: source.version,
              },
            ],
            calculationVersionId: null,
            sourceDigest: `manual:${identity.profile.id}:${entryIndex}`,
            basisType: 'manual_portion',
            basisAmount: 1,
            basisUnit: 'day',
            confidence: 0.9,
            completeness: 0.8,
            estimated: false,
          },
          values: [
            {
              nutrientCode: 'energy_kcal',
              amount: 1_000,
              sourceIds: [source.id],
              confidence: 0.9,
              completeness: 0.8,
              estimated: false,
            },
            ...(identityIndex === 2
              ? (
                  [
                    ['protein', 500],
                    ['carbohydrate', 1_250],
                    ['fiber', 1_500],
                    ['total_fat', 1_800],
                  ] as const
                ).map(([nutrientCode, amount]) => ({
                  nutrientCode,
                  amount,
                  sourceIds: [source.id],
                  confidence: 0.9,
                  completeness: 0.8,
                  estimated: false,
                }))
              : []),
          ],
        });
      }
    });
    const recipeId = crypto.randomUUID();
    const mealPlanEntryId = crypto.randomUUID();
    const createdAt = new Date('2026-07-19T18:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Shared soup',
        summary: '',
        status: 'active',
        servings: '10 servings',
        prepMinutes: 0,
        cookMinutes: 0,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        createdByProfileId: householdProfiles[0]!.id,
        lastEditedByProfileId: householdProfiles[0]!.id,
        currentRevision: 1,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: mealPlanEntryId,
        plannedFor: '2026-07-19',
        meal: 'dinner',
        recipeId,
        title: '',
        servings: 10,
        note: '',
        createdByProfileId: householdProfiles[0]!.id,
        updatedByProfileId: householdProfiles[0]!.id,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
    const servingByState = {
      planned: 0.5,
      served: 1,
      eaten: 1.5,
      skipped: 2,
      leftover: 1,
    } as const;
    getDatabase()
      .insert(nutritionMealAllocationVersions)
      .values(
        Object.entries(servingByState).map(([state, servings]) => ({
          id: crypto.randomUUID(),
          seriesId: crypto.randomUUID(),
          revision: 1,
          nutritionProfileId: requester.profile.id,
          mealPlanEntryId,
          cookSessionId: null,
          preparedRecipeInstanceId: null,
          state: state as keyof typeof servingByState,
          servings,
          portionWeightGrams: null,
          intakeSeriesId: state === 'eaten' ? crypto.randomUUID() : null,
          note: '',
          supersedesAllocationVersionId: null,
          createdByPrincipalId: requester.principal.id,
          actorHouseholdProfileId: requester.profile.linkedHouseholdProfileId,
          createdAt,
        })),
      )
      .run();
    const select = vi.spyOn(getDatabase(), 'select');
    const comparison = getHouseholdNutritionComparison(requester.principal.id, {
      now: new Date('2026-07-20T12:00:00Z'),
    });
    expect(select).toHaveBeenCalledTimes(7);
    const serialized = JSON.stringify(comparison);
    expect(comparison.members).toHaveLength(4);
    expect(comparison.members.map((member) => member.label)).toEqual([
      'Requesting Avery',
      'Named Morgan',
      'Secret Riley',
      'Hidden Taylor',
    ]);
    expect(serialized).not.toContain('sourceNameSnapshot');
    expect(serialized).not.toContain('occurredAt');
    expect(comparison.members.map((member) => member.nutrients[0]?.normalizedPercent)).toEqual([
      50, 100, 100, 50,
    ]);
    expect(comparison.members.map((member) => member.nutrients[0]?.semantic)).toEqual([
      'coverage',
      'coverage',
      'range-position',
      'limit-usage',
    ]);
    expect(
      Object.fromEntries(
        comparison.members[2]!.nutrients.map((nutrient) => [
          nutrient.nutrientCode,
          { normalizedPercent: nutrient.normalizedPercent, status: nutrient.status },
        ]),
      ),
    ).toEqual({
      energy_kcal: { normalizedPercent: 100, status: 'within' },
      protein: { normalizedPercent: 50, status: 'below' },
      carbohydrate: { normalizedPercent: 100, status: 'within' },
      fiber: { normalizedPercent: 100, status: 'within' },
      total_fat: { normalizedPercent: 120, status: 'above' },
    });
    expect(comparison.members[2]?.observedDays).toBe(3);
    expect(comparison.members[0]?.allocationServings).toEqual(servingByState);
    expect(comparison.allocationSummary).toEqual({
      plannedMealServings: 10,
      unassignedServings: 6,
      unknownServingAllocations: 0,
    });

    for (const periodDays of [7, 14, 30, 90]) {
      select.mockClear();
      const ranged = getHouseholdNutritionComparison(requester.principal.id, {
        now: new Date('2026-07-20T12:00:00Z'),
        periodDays,
      });
      expect(ranged.periodDays).toBe(periodDays);
      expect(ranged.range.end).toBe('2026-07-20');
      expect(ranged.members[2]?.observedDays).toBe(3);
      expect(select.mock.calls.length).toBeLessThanOrEqual(8);
    }
  });
});
