import { expect, it } from 'vitest';
import {
  actionReviewLines,
  type AppActionReviewMetadata,
} from '../../shared/mobile-domain/app-action-review';
it('shares named context and before/after lines with web without manufacturing a value for a bodyless action', () => {
  const review: AppActionReviewMetadata = {
    schemaVersion: 1,
    subject: { kind: 'Meal', label: 'Friday lentil supper' },
    effect: 'Remove meal',
    context: [
      { label: 'Date', value: '2026-10-23' },
      { label: 'Meal', value: 'Dinner' },
      { label: 'Servings', value: '4' },
    ],
    changes: [],
    caveats: [],
  };
  expect(actionReviewLines(review)).toEqual(review.context);
  expect(
    actionReviewLines({ ...review, changes: [{ label: 'Servings', before: '4', after: '6' }] }),
  ).toContainEqual({ label: 'Servings', value: '4 → 6' });
  expect(actionReviewLines(review).some((line) => line.label === 'Value')).toBe(false);
});
