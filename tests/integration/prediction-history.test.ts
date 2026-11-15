import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { listShoppingTrips, recordShoppingTrip } from '@/lib/services/shopping-trip-service';
import { storeDecision } from '@/lib/services/decision-cache-service';
import { predictionHistory } from '@/lib/services/prediction-history-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
let principal: RequestPrincipal;
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  resetDatabaseForTests();
  const profile = completeSetup({
    householdName: 'Kitchen',
    appName: 'Bord',
    profile: {
      displayName: 'Maya',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
    },
  }).profiles[0]!;
  principal = {
    kind: 'session',
    userId: 'owner',
    profileId: profile.id,
    linkedProfileId: profile.id,
    role: 'admin',
    accountRole: 'admin',
    activeProfileRole: 'admin',
    sessionId: 'fixture',
    apiKeyId: null,
  };
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
it('migrates shopping history and isolates accounts even on the same active profile', () => {
  recordShoppingTrip(principal, {
    occurredOn: '2026-01-01',
    size: 'large',
    note: 'Weekly groceries',
  });
  expect(listShoppingTrips(principal)).toHaveLength(1);
  expect(listShoppingTrips({ ...principal, userId: 'another-account' })).toEqual([]);
  expect(listShoppingTrips({ ...principal, profileId: 'another-profile' })).toEqual([]);
});
it('logs historical forecasts with evidence, paginates and excludes action proposals', () => {
  for (let i = 0; i < 22; i++)
    storeDecision(principal, {
      task: 'next_shop',
      subject: String(i),
      hash: String(i),
      evidence: { stock: 'unknown' },
      result: { choice: 'unknown' },
    });
  storeDecision(principal, {
    task: 'app_actions',
    subject: 'private-action',
    hash: 'x',
    evidence: {},
    result: {},
  });
  const first = predictionHistory(principal, 0);
  expect(first.records).toHaveLength(20);
  expect(first.nextOffset).toBe(20);
  expect(predictionHistory(principal, 20).records).toHaveLength(2);
  expect(predictionHistory({ ...principal, userId: 'another-account' }, 0).records).toEqual([]);
  expect(first.records[0].evidence).toEqual({ stock: 'unknown' });
});
