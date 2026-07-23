import { describe, expect, it } from 'vitest';

import {
  latestMealAllocationVersions,
  mealAllocationCapacity,
  plannedConsumedDifference,
  scaleMealNutrients,
} from '@/lib/domain/nutrition-meal-planning';

describe('nutrition meal planning calculations', () => {
  it('keeps latest immutable allocation versions and derives an explicit unassigned pool', () => {
    const versions = [
      { id: 'a1', seriesId: 'a', revision: 1, state: 'planned' as const, servings: 1 },
      { id: 'a2', seriesId: 'a', revision: 2, state: 'served' as const, servings: 1.5 },
      { id: 'b1', seriesId: 'b', revision: 1, state: 'planned' as const, servings: 0.5 },
      { id: 'c1', seriesId: 'c', revision: 1, state: 'skipped' as const, servings: 1 },
    ];

    expect(latestMealAllocationVersions(versions).map((item) => item.id)).toEqual([
      'a2',
      'b1',
      'c1',
    ]);
    expect(mealAllocationCapacity(4, versions)).toEqual({
      assignedServings: 2,
      unassignedServings: 2,
      overallocatedServings: 0,
    });
    expect(mealAllocationCapacity(4, versions, 'a')).toEqual({
      assignedServings: 0.5,
      unassignedServings: 3.5,
      overallocatedServings: 0,
    });
  });

  it('scales fractional planned portions and compares them separately with consumed totals', () => {
    const planned = scaleMealNutrients(
      [
        { nutrientCode: 'energy_kcal', amount: 1_600 },
        { nutrientCode: 'protein', amount: 80 },
      ],
      4,
      1.5,
    );
    expect(planned).toEqual({ energy_kcal: 600, protein: 30 });
    expect(plannedConsumedDifference(planned!, { energy_kcal: 420, protein: 22 })).toEqual({
      energy_kcal: 180,
      protein: 8,
    });
    expect(scaleMealNutrients([], null, 1)).toBeNull();
  });
});
