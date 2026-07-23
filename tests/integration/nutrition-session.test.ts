import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('server-only', () => ({}));

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { nutritionPrincipals } from '@/lib/db/schema';
import { issueNutritionSessionValue, resolveNutritionSession } from '@/lib/nutrition-session';
import { rotateNutritionAccessSecret } from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity } from './nutrition-household-fixture';

describe('Nutrition signed session resolution', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-session-media');
    vi.stubEnv('COOKIE_SECRET', 'test-only-cookie-secret-that-is-at-least-32-bytes');
    resetDatabaseForTests();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('keeps legacy session rows non-destructive while rejecting credential rotation', () => {
    const created = createNutritionIdentity('correct horse battery staple', {
      displayName: 'Private Avery',
    });
    const now = new Date('2026-07-19T20:00:00Z');
    const value = issueNutritionSessionValue(created.principal, now);
    expect(resolveNutritionSession(value, now)?.id).toBe(created.principal.id);
    expect(resolveNutritionSession(`${value}tampered`, now)).toBeNull();

    expect(() =>
      rotateNutritionAccessSecret(
        created.principal.id,
        'correct horse battery staple',
        'a completely different private secret',
        1,
      ),
    ).toThrow('Nutrition credentials are retired.');
    getDatabase()
      .update(nutritionPrincipals)
      .set({ archivedAt: now })
      .where(eq(nutritionPrincipals.id, created.principal.id))
      .run();
    expect(resolveNutritionSession(value, now)).toBeNull();
  });
});
