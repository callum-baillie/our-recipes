import { beforeEach, expect, it, vi } from 'vitest';
import { expandBulkAppActions } from '@/lib/domain/ai-bulk-actions';
import { shoppingTripSchema } from '@/lib/domain/shopping-trips';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  policy: {
    sharePantry: true,
    shareShoppingLists: true,
    shareMealPlans: true,
    shareSharedRecipes: true,
  },
  trips: vi.fn(() => []),
  meals: vi.fn(() => []),
  pantry: vi.fn(() => ({ batches: [], lowStockProductIds: [] })),
}));
vi.mock('@/lib/services/ai-settings-service', () => ({ getAiDataPolicy: () => mocks.policy }));
vi.mock('@/lib/services/shopping-trip-service', () => ({ listShoppingTrips: mocks.trips }));
vi.mock('@/lib/services/planning-service', () => ({ listPlannedMeals: mocks.meals }));
vi.mock('@/lib/services/pantry-service', () => ({
  getPantryDashboard: mocks.pantry,
  listPantryLocations: () => [],
}));
vi.mock('@/lib/services/decision-jobs-service', () => ({ buildDecisionJobs: vi.fn() }));
import { buildPredictionJobs } from '@/lib/services/prediction-jobs-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import { decisionRequestSchema } from '@/lib/domain/decision-assistance';
const principal = { userId: 'owner', profileId: 'profile' } as RequestPrincipal;
beforeEach(() => {
  mocks.policy.sharePantry = true;
  mocks.policy.shareShoppingLists = true;
  vi.clearAllMocks();
});
it('requires stock and shopping sharing before reading trip history', async () => {
  mocks.policy.shareShoppingLists = false;
  await expect(
    buildPredictionJobs(principal, decisionRequestSchema.parse({ task: 'next_shop' })),
  ).rejects.toThrow('shopping-list sharing');
  expect(mocks.trips).not.toHaveBeenCalled();
  mocks.policy.sharePantry = false;
  await expect(
    buildPredictionJobs(principal, decisionRequestSchema.parse({ task: 'pantry_expiry' })),
  ).rejects.toThrow('Pantry sharing');
  expect(mocks.pantry).toHaveBeenCalledTimes(1);
});
it('offers unknown rather than equating empty tracking with an empty kitchen', async () => {
  const jobs = await buildPredictionJobs(
    principal,
    decisionRequestSchema.parse({ task: 'next_shop' }),
  );
  expect(jobs![0].options.map((o) => o.value)).toContain('unknown');
  expect(jobs![0].instructions).toContain('not physical pantry fullness');
  expect(mocks.trips).toHaveBeenCalledWith(principal);
});
it('bulk proposals preserve per-target versions and enforce bounded review', () => {
  const target = {
    parametersJson: '{"batchId":"observed"}',
    bodyJson: '{"expectedVersion":4,"type":"move"}',
  };
  expect(
    expandBulkAppActions({
      title: 'Move stock',
      operationId: 'applyPantryBatchAction',
      targets: [target],
    }).actions[0],
  ).toEqual({ ...target, operationId: 'applyPantryBatchAction', bindings: [] });
  expect(() =>
    expandBulkAppActions({
      title: 'Too many',
      operationId: 'trashRecipe',
      targets: Array(21).fill(target),
    }),
  ).toThrow();
});
it('rejects invented dates, future completed trips and unrecognized fields', () => {
  expect(shoppingTripSchema.safeParse({ occurredOn: '2026-02-30', size: 'large' }).success).toBe(
    false,
  );
  expect(shoppingTripSchema.safeParse({ occurredOn: '2999-01-01', size: 'large' }).success).toBe(
    false,
  );
  expect(
    shoppingTripSchema.safeParse({ occurredOn: '2026-01-01', size: 'large', ownerUserId: 'other' })
      .success,
  ).toBe(false);
});
