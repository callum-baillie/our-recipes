import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { recipes } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import { appendNutritionIntakeRevision } from '@/lib/services/nutrition-intake-service';
import { appendNutritionGoalVersion } from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';
import {
  appendNutritionRecommendationFeedback,
  getNutritionRecommendations,
} from '@/lib/services/nutrition-recommendation-service';

describe('private deterministic Nutrition recommendations', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-recommendations');
    resetDatabaseForTests();
  });

  it('uses sufficient immutable evidence and binds private feedback to its deterministic key', () => {
    const householdProfile = completeSetup({
      householdName: 'Recommendation household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Cook',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!;
    const identity = createNutritionIdentity('recommendation owner secret', {
      displayName: 'Private diner',
      linkedHouseholdProfileId: householdProfile.id,
      dailyResetTimezone: 'America/Los_Angeles',
    });
    const source = createNutritionDataSource({
      sourceType: 'manual',
      name: 'Recommendation fixture',
      provider: 'Our Recipes',
      version: '1',
    });
    appendNutritionGoalVersion(identity.profile.id, identity.principal.id, {
      nutrientCode: 'fiber',
      unit: 'g',
      sourceType: 'user_defined',
      startsOn: '2026-07-01',
      kind: 'minimum',
      value: 30,
    });
    for (const [index, occurredAt] of [
      '2026-07-17T19:00:00-07:00',
      '2026-07-18T19:00:00-07:00',
      '2026-07-19T12:00:00-07:00',
    ].entries()) {
      appendNutritionIntakeRevision(identity.profile.id, identity.principal.id, {
        occurredAt,
        mealSlot: 'dinner',
        state: 'eaten',
        sourceType: 'manual',
        sourceNameSnapshot: 'Recorded food',
        quantity: 1,
        unit: 'portion',
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
          sourceDigest: `recommendation-entry-${index}`,
          basisType: 'manual_portion',
          basisAmount: 1,
          basisUnit: 'portion',
          confidence: 0.9,
          completeness: 0.9,
          estimated: false,
        },
        values: [
          {
            nutrientCode: 'fiber',
            amount: 10,
            sourceIds: [source.id],
            confidence: 0.9,
            completeness: 0.9,
            estimated: false,
          },
        ],
      });
    }
    const recipeId = crypto.randomUUID();
    const now = new Date('2026-07-19T18:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Evidence lentil soup',
        summary: '',
        status: 'active',
        servings: '4 servings',
        prepMinutes: 10,
        cookMinutes: 20,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        createdByProfileId: householdProfile.id,
        lastEditedByProfileId: householdProfile.id,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const calculationSource = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'Recommendation calculator',
      provider: 'Our Recipes',
      version: '1',
    });
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'recommendation-v1',
    });
    appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 1,
      calculationVersionId: version.id,
      sourceId: calculationSource.id,
      sourceDigest: 'recommendation-calculation-v1',
      servingCount: 4,
      confidence: 0.9,
      completeness: 0.9,
      values: [{ nutrientCode: 'fiber', amount: 40, confidence: 0.9, completeness: 0.9 }],
    });

    const recommendations = getNutritionRecommendations(
      identity.profile.id,
      identity.principal.id,
      new Date('2026-07-19T20:00:00-07:00'),
    );
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      nutrientCode: 'fiber',
      recipeId,
      gapAmount: 20,
      gapCoveragePercent: 50,
      pantryState: 'ready',
    });
    const key = recommendations[0]!.key;
    const feedback = appendNutritionRecommendationFeedback(
      identity.profile.id,
      identity.principal.id,
      key,
      { state: 'dismissed' },
      new Date('2026-07-19T20:00:00-07:00'),
    );
    expect(
      appendNutritionRecommendationFeedback(
        identity.profile.id,
        identity.principal.id,
        key,
        { state: 'dismissed' },
        new Date('2026-07-19T20:00:00-07:00'),
      ).id,
    ).toBe(feedback.id);
    expect(
      getNutritionRecommendations(
        identity.profile.id,
        identity.principal.id,
        new Date('2026-07-19T20:00:00-07:00'),
      ),
    ).toEqual([]);
    const stranger = createNutritionPrincipal('recommendation stranger secret');
    expect(() =>
      getNutritionRecommendations(
        identity.profile.id,
        stranger.id,
        new Date('2026-07-19T20:00:00-07:00'),
      ),
    ).toThrow();
  });
});
