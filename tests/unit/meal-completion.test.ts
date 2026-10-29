import { expect, it } from 'vitest';
import { mealScanTiming } from '@/lib/domain/meal-completion';
it('matches dinner only in its meal window and treats a slow roast morning as preparation', () => {
  expect(mealScanTiming('dinner', 16)).toBe('meal');
  expect(mealScanTiming('dinner', 20.99)).toBe('meal');
  expect(mealScanTiming('dinner', 21)).toBe('review');
  expect(mealScanTiming('dinner', 7, 600)).toBe('preparing');
  expect(mealScanTiming('dinner', 7, 30)).toBe('review');
  expect(mealScanTiming('custom-meal', 17, 60)).toBe('review');
});
