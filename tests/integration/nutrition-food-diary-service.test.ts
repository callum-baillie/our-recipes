import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ensureDatabase, getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { pantryProducts, profiles } from '@/lib/db/schema';
import {
  appendConfirmedProductConsumption,
  appendManualConsumption,
  deleteNutritionIntake,
} from '@/lib/services/nutrition-food-diary-service';
import { appendManualProductNutritionRecord } from '@/lib/services/nutrition-recipe-calculation-service';
import { listNutritionIntakeRevisions } from '@/lib/services/nutrition-intake-service';
import { createNutritionIdentity } from './nutrition-household-fixture';

describe('Food Diary product, manual, correction, and deletion service', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-food-diary');
    resetDatabaseForTests();
    ensureDatabase();
    const now = new Date('2026-07-19T00:00:00Z');
    const database = getDatabase();
    database
      .insert(profiles)
      .values({
        id: actorId,
        displayName: 'Avery',
        color: '#245b78',
        avatarUrl: null,
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(pantryProducts)
      .values({
        id: productId,
        normalizedName: 'lentils',
        displayName: 'Lentils',
        defaultInventoryUnit: 'g',
        createdByProfileId: actorId,
        updatedByProfileId: actorId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('server-builds product/manual revisions and preserves immutable history', () => {
    const record = appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 0.9,
      completeness: 0.75,
      values: [
        { nutrientCode: 'energy_kcal', amount: 350 },
        { nutrientCode: 'protein', amount: 25 },
      ],
    });
    const identity = createNutritionIdentity('correct horse battery staple', {
      displayName: 'Private Avery',
    });
    const timing = { occurredAt: '2026-07-19T18:00:00-07:00', mealSlot: 'dinner' as const };
    const first = appendConfirmedProductConsumption(identity.profile.id, identity.principal.id, {
      ...timing,
      productId,
      quantity: 50,
      unit: 'g',
    });
    expect(first.values.find((value) => value.nutrientCode === 'energy_kcal')?.amount).toBe(175);
    expect(first).toMatchObject({
      sourceType: 'product',
      foodNutritionRecordId: record.id,
      quantity: 50,
      unit: 'g',
    });

    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 1,
      completeness: 1,
      supersedesRecordId: record.id,
      values: [{ nutrientCode: 'energy_kcal', amount: 400 }],
    });
    const correctedProduct = appendConfirmedProductConsumption(
      identity.profile.id,
      identity.principal.id,
      {
        ...timing,
        productId,
        quantity: 100,
        unit: 'g',
        supersedesIntakeRevisionId: first.id,
        revisionReason: 'The portion was twice as large.',
      },
    );
    expect(correctedProduct.foodNutritionRecordId).toBe(record.id);
    expect(
      correctedProduct.values.find((value) => value.nutrientCode === 'energy_kcal')?.amount,
    ).toBe(350);

    const manual = appendManualConsumption(identity.profile.id, identity.principal.id, {
      ...timing,
      sourceName: 'Cafe soup',
      quantity: 1,
      unit: 'bowl',
      values: [
        { nutrientCode: 'energy_kcal', amount: 320 },
        { nutrientCode: 'protein', amount: 12 },
      ],
    });
    expect(manual.provenance).toMatchObject({ confidence: 0.5, estimated: true });
    expect(manual.values.every((value) => value.confidence === 0.5 && value.estimated)).toBe(true);
    const correctedManual = appendManualConsumption(identity.profile.id, identity.principal.id, {
      ...timing,
      sourceName: 'Cafe soup',
      quantity: 1.5,
      unit: 'bowl',
      values: [{ nutrientCode: 'energy_kcal', amount: 480 }],
      supersedesIntakeRevisionId: manual.id,
      revisionReason: 'The bowl was larger.',
    });
    const deleted = deleteNutritionIntake(
      identity.profile.id,
      identity.principal.id,
      correctedManual.id,
      { reason: 'Logged on the wrong day.' },
    );
    expect(deleted).toMatchObject({ state: 'deleted', values: [], provenance: null, revision: 3 });
    const history = listNutritionIntakeRevisions(identity.profile.id, identity.principal.id);
    expect(history.find((entry) => entry.id === manual.id)?.values[0]?.amount).toBe(320);
    expect(history.find((entry) => entry.id === correctedManual.id)?.values[0]?.amount).toBe(480);
  });
});
