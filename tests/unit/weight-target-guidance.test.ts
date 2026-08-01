import { describe, expect, it } from 'vitest';

import { weightTargetTimeline } from '@/lib/domain/weight-target-guidance';

describe('weight target guidance', () => {
  it('turns a gradual loss target into a transparent timeline estimate', () => {
    expect(
      weightTargetTimeline({
        goalType: 'loss',
        currentWeightKilograms: 80,
        targetWeightKilograms: 75,
        pace: 'steady',
        startsOn: '2026-07-28',
      }),
    ).toEqual({ changeKilograms: 5, weeks: 10, targetDate: '2026-10-06' });
  });

  it('refuses a target that conflicts with the selected direction', () => {
    expect(
      weightTargetTimeline({
        goalType: 'gain',
        currentWeightKilograms: 70,
        targetWeightKilograms: 68,
        pace: 'gradual',
        startsOn: '2026-07-28',
      }),
    ).toBeNull();
  });
});
