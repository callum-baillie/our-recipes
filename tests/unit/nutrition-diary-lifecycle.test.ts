import { describe, expect, it } from 'vitest';

import {
  moveNutritionLocalTimeToDate,
  nutritionDiaryCommandSchema,
  nutritionProfileDeletionSchema,
} from '@/lib/domain/nutrition-diary-lifecycle';

describe('Nutrition diary lifecycle commands', () => {
  it('accepts intent only and rejects browser-supplied nutrient snapshots', () => {
    const valid = {
      command: 'copy_entry',
      sourceRevisionId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-07-21T18:30:00-07:00',
      mealSlot: 'dinner',
      idempotencyKey: 'copy-entry-0001',
    };
    expect(nutritionDiaryCommandSchema.parse(valid)).toEqual(valid);
    expect(() =>
      nutritionDiaryCommandSchema.parse({
        ...valid,
        values: [{ nutrientCode: 'energy_kcal', amount: 9999 }],
      }),
    ).toThrow();
  });

  it('requires a positive expected version and a bounded exact deletion phrase', () => {
    expect(
      nutritionProfileDeletionSchema.parse({
        confirmation: 'DELETE Private Avery',
        expectedVersion: 3,
      }),
    ).toEqual({ confirmation: 'DELETE Private Avery', expectedVersion: 3 });
    expect(() =>
      nutritionProfileDeletionSchema.parse({
        confirmation: 'DELETE Private Avery',
        expectedVersion: 0,
      }),
    ).toThrow();
  });

  it('preserves wall-clock meal time across timezone and daylight-saving changes', () => {
    const moved = moveNutritionLocalTimeToDate(
      new Date('2026-01-15T20:30:00Z'),
      '2026-07-19',
      'America/Los_Angeles',
      'America/New_York',
    );
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(moved);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    expect(`${value('year')}-${value('month')}-${value('day')}`).toBe('2026-07-19');
    expect(`${value('hour')}:${value('minute')}`).toBe('12:30');
  });
});
