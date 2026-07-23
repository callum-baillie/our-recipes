import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { nutritionIntakeNutrientValues, nutritionIntakeRevisions } from '@/lib/db/schema';
import { getIndividualNutritionChartWorkspace } from '@/lib/services/nutrition-individual-chart-service';
import {
  NutritionProfileForbiddenError,
  appendNutritionGoalVersion,
  appendNutritionPermission,
} from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';

describe('bounded individual Nutrition chart workspace', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-individual-charts');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  function insertRevision(input: {
    profileId: string;
    principalId: string;
    id: string;
    seriesId: string;
    revision: number;
    occurredAt: string;
    state: 'eaten' | 'corrected' | 'deleted';
    amount?: number;
  }) {
    getDatabase()
      .insert(nutritionIntakeRevisions)
      .values({
        id: input.id,
        seriesId: input.seriesId,
        revision: input.revision,
        nutritionProfileId: input.profileId,
        occurredAt: new Date(input.occurredAt),
        mealSlot: 'dinner',
        state: input.state,
        sourceType: 'manual',
        sourceNameSnapshot: 'Frozen manual dinner',
        provenanceSnapshot:
          input.state === 'eaten' || input.state === 'corrected' ? '{"source":"test"}' : null,
        revisionReason: '',
        createdByPrincipalId: input.principalId,
        actorHouseholdProfileId: input.profileId,
        createdAt: new Date(input.occurredAt),
      })
      .run();
    if (input.amount !== undefined) {
      getDatabase()
        .insert(nutritionIntakeNutrientValues)
        .values([
          {
            intakeRevisionId: input.id,
            nutrientCode: 'energy_kcal',
            amount: input.amount,
            sourceIdsSnapshot: '["manual:test"]',
            confidence: 0.9,
            completeness: 1,
            estimated: false,
          },
          {
            intakeRevisionId: input.id,
            nutrientCode: 'fiber',
            amount: 10,
            sourceIdsSnapshot: '["manual:test"]',
            confidence: 0.8,
            completeness: 0.75,
            estimated: true,
          },
        ])
        .run();
    }
  }

  it('selects latest series state before range and uses exact profile-local dates', () => {
    const owner = createNutritionIdentity('private chart owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'America/Los_Angeles',
    });
    insertRevision({
      profileId: owner.profile.id,
      principalId: owner.principal.id,
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: '22222222-2222-4222-8222-222222222222',
      revision: 1,
      occurredAt: '2026-07-19T18:00:00Z',
      state: 'eaten',
      amount: 500,
    });
    insertRevision({
      profileId: owner.profile.id,
      principalId: owner.principal.id,
      id: '33333333-3333-4333-8333-333333333333',
      seriesId: '22222222-2222-4222-8222-222222222222',
      revision: 2,
      occurredAt: '2026-07-21T18:00:00Z',
      state: 'deleted',
    });
    insertRevision({
      profileId: owner.profile.id,
      principalId: owner.principal.id,
      id: '44444444-4444-4444-8444-444444444444',
      seriesId: '55555555-5555-4555-8555-555555555555',
      revision: 1,
      occurredAt: '2026-07-19T06:30:00Z',
      state: 'eaten',
      amount: 300,
    });
    const workspace = getIndividualNutritionChartWorkspace(owner.profile.id, owner.principal.id, {
      endDate: '2026-07-19',
      days: 7,
      selectedNutrients: ['fiber'],
    });
    expect(workspace.entries).toHaveLength(1);
    expect(workspace.entries[0]).toMatchObject({ localDate: '2026-07-18' });
    expect(workspace.entries[0]?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nutrientCode: 'energy_kcal', amount: 300 }),
      ]),
    );
  });

  it('allows household chart reads and rejects retired permission grants', () => {
    const owner = createNutritionIdentity('private chart owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'UTC',
    });
    appendNutritionGoalVersion(owner.profile.id, owner.principal.id, {
      nutrientCode: 'fiber',
      unit: 'g',
      sourceType: 'user_defined',
      startsOn: '2026-07-01',
      kind: 'minimum',
      value: 30,
    });
    const stranger = createNutritionPrincipal('private chart stranger secret');
    expect(
      getIndividualNutritionChartWorkspace(owner.profile.id, stranger.id, {
        endDate: '2026-07-19',
        days: 7,
        selectedNutrients: ['fiber'],
      }),
    ).toMatchObject({ goalContext: 'unavailable' });
    expect(() =>
      appendNutritionPermission(owner.profile.id, owner.principal.id, {
        principalId: stranger.id,
        role: 'viewer',
        canViewDiary: true,
        canViewMeasurements: false,
        canManageProfile: false,
        canManageGoals: false,
        canViewComparison: false,
        canExportData: false,
        canDeleteData: false,
        expiresAt: null,
      }),
    ).toThrow(NutritionProfileForbiddenError);
    const viewer = getIndividualNutritionChartWorkspace(owner.profile.id, stranger.id, {
      endDate: '2026-07-19',
      days: 7,
      selectedNutrients: ['fiber'],
    });
    expect(viewer.goalContext).toBe('unavailable');
    expect(viewer.goals).toHaveLength(0);
    const ownerView = getIndividualNutritionChartWorkspace(owner.profile.id, owner.principal.id, {
      endDate: '2026-07-19',
      days: 7,
      selectedNutrients: ['fiber'],
    });
    expect(ownerView.goalContext).toBe('available');
    expect(ownerView.goals).toHaveLength(1);
  });

  it('keeps a large bounded range query independent of nutrient row count', () => {
    const owner = createNutritionIdentity('private chart owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'UTC',
    });
    getDatabase().transaction((transaction) => {
      for (let index = 0; index < 1_000; index += 1) {
        const suffix = String(index).padStart(12, '0');
        const id = `00000000-0000-4000-8000-${suffix}`;
        transaction
          .insert(nutritionIntakeRevisions)
          .values({
            id,
            seriesId: id,
            revision: 1,
            nutritionProfileId: owner.profile.id,
            occurredAt: new Date('2026-07-19T12:00:00Z'),
            mealSlot: 'other',
            state: 'eaten',
            sourceType: 'manual',
            sourceNameSnapshot: 'Bulk fixture',
            provenanceSnapshot: '{"source":"bulk-test"}',
            revisionReason: '',
            createdByPrincipalId: owner.principal.id,
            actorHouseholdProfileId: owner.profile.linkedHouseholdProfileId,
            createdAt: new Date('2026-07-19T12:00:00Z'),
          })
          .run();
        transaction
          .insert(nutritionIntakeNutrientValues)
          .values({
            intakeRevisionId: id,
            nutrientCode: 'fiber',
            amount: 1,
            sourceIdsSnapshot: '["bulk"]',
            confidence: 1,
            completeness: 1,
            estimated: false,
          })
          .run();
      }
    });
    const started = performance.now();
    const workspace = getIndividualNutritionChartWorkspace(owner.profile.id, owner.principal.id, {
      endDate: '2026-07-19',
      days: 30,
      selectedNutrients: ['fiber'],
    });
    expect(workspace.entries).toHaveLength(1_000);
    expect(performance.now() - started).toBeLessThan(2_500);
  });
});
