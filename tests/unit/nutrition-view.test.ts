import { describe, expect, it } from 'vitest';

import { nutritionLocalDateKey, summarizeNutritionDiary } from '@/lib/domain/nutrition-view';

const value = (amount: number, completeness = 0.8) => ({
  nutrientCode: 'energy_kcal',
  amount,
  confidence: 0.9,
  completeness,
  estimated: true,
});

describe('Nutrition diary views', () => {
  it('uses the profile diary timezone around midnight', () => {
    const instant = new Date('2026-07-18T06:00:00Z');
    expect(nutritionLocalDateKey(instant, 'America/Los_Angeles')).toBe('2026-07-17');
    expect(nutritionLocalDateKey(instant, 'UTC')).toBe('2026-07-18');
  });

  it('counts only the latest explicit consumed revision and preserves missing days', () => {
    const summary = summarizeNutritionDiary(
      [
        {
          id: 'old',
          seriesId: 'meal-a',
          revision: 1,
          occurredAt: new Date('2026-07-19T20:00:00Z'),
          state: 'eaten',
          sourceNameSnapshot: 'Soup',
          mealSlot: 'dinner',
          values: [value(400)],
        },
        {
          id: 'corrected',
          seriesId: 'meal-a',
          revision: 2,
          occurredAt: new Date('2026-07-19T20:00:00Z'),
          state: 'corrected',
          sourceNameSnapshot: 'Soup',
          mealSlot: 'dinner',
          values: [value(500)],
        },
        {
          id: 'planned-is-not-intake',
          seriesId: 'meal-b',
          revision: 1,
          occurredAt: new Date('2026-07-19T12:00:00Z'),
          state: 'skipped',
          sourceNameSnapshot: '',
          mealSlot: 'lunch',
          values: [],
        },
      ],
      { now: new Date('2026-07-19T18:00:00Z'), timeZone: 'America/Los_Angeles' },
    );
    expect(summary.todayTotals.energy_kcal).toBe(500);
    expect(summary.consumedEntries.map((entry) => entry.id)).toEqual(['corrected']);
    expect(summary.currentEntries).toHaveLength(2);
    expect(summary.trend).toHaveLength(7);
    expect(summary.trend.filter((day) => day.energyKcal === null)).toHaveLength(6);
    expect(summary.hasEstimatedValues).toBe(true);
  });

  it('removes a deleted series from totals and reports no data as unknown', () => {
    const summary = summarizeNutritionDiary(
      [
        {
          id: 'eaten',
          seriesId: 'meal-a',
          revision: 1,
          occurredAt: new Date('2026-07-19T12:00:00Z'),
          state: 'eaten',
          sourceNameSnapshot: 'Toast',
          mealSlot: 'breakfast',
          values: [value(200)],
        },
        {
          id: 'deleted',
          seriesId: 'meal-a',
          revision: 2,
          occurredAt: new Date('2026-07-19T12:00:00Z'),
          state: 'deleted',
          sourceNameSnapshot: '',
          mealSlot: 'breakfast',
          values: [],
        },
      ],
      { now: new Date('2026-07-19T18:00:00Z'), timeZone: 'UTC' },
    );
    expect(summary.todayTotals).toEqual({});
    expect(summary.averageCompleteness).toBeNull();
    expect(summary.trend.every((day) => day.energyKcal === null)).toBe(true);
  });

  it.each([7, 14, 30] as const)(
    'builds an exact %i-day local range without zero filling',
    (days) => {
      const summary = summarizeNutritionDiary([], {
        now: new Date('2026-07-19T18:00:00Z'),
        timeZone: 'America/Los_Angeles',
        days,
      });
      expect(summary.trend).toHaveLength(days);
      expect(summary.trend[0]?.date).toBe(
        days === 7 ? '2026-07-13' : days === 14 ? '2026-07-06' : '2026-06-20',
      );
      expect(summary.trend.at(-1)?.date).toBe('2026-07-19');
      expect(summary.trend.every((day) => day.energyKcal === null)).toBe(true);
    },
  );
});
