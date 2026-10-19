import { describe, expect, it } from 'vitest';
import { DEFAULT_MEAL_PLAN_PREFERENCES } from '@/lib/domain/app-preferences';
import {
  effectivePlanEntries,
  nextMealDate,
  plannerFocus,
  plannerMealOptions,
  planningRangeError,
  shiftPlannerFocus,
} from '@/lib/domain/planner-workflow';
describe('planner calendar and review scope', () => {
  it('retains an explicitly requested empty date rather than jumping to today', () => {
    expect(plannerFocus('2026-10-25', '2026-10-19', '2026-10-25', '2026-10-19')).toBe('2026-10-25');
    expect(plannerFocus('2026-11-01', '2026-10-19', '2026-10-25', '2026-10-19')).toBe('2026-10-19');
    expect(plannerFocus(undefined, '2026-11-01', '2026-11-30', '2026-10-19')).toBe('2026-11-01');
  });
  it.each([
    ['2026-12-31', '2027-01-01'],
    ['2026-10-25', '2026-10-26'],
    ['2028-02-28', '2028-02-29'],
  ])('duplicates %s to the actual next date %s', (date, next) => {
    expect(nextMealDate(date)).toBe(next);
  });
  it('keeps the weekday or day anchor while changing periods', () => {
    expect(shiftPlannerFocus('2026-10-25', 'week', 1)).toBe('2026-11-01');
    expect(shiftPlannerFocus('2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(shiftPlannerFocus('2028-03-31', 'month', -1)).toBe('2028-02-29');
  });
  it('accepts inclusive 1–14 days and rejects incomplete, reversed or over-limit dates', () => {
    expect(planningRangeError('2026-10-19', '2026-10-19')).toBeNull();
    expect(planningRangeError('2026-10-19', '2026-11-01')).toBeNull();
    for (const end of ['', '2026-10-18', '2026-11-02', '2026-02-30'])
      expect(planningRangeError('2026-10-19', end)).toBeTruthy();
  });
  it('keeps historical custom types in the row vocabulary after removal', () => {
    const options = plannerMealOptions(DEFAULT_MEAL_PLAN_PREFERENCES, [
      'custom-afternoon-tea',
      'custom-afternoon-tea',
    ]);
    expect(options.filter((option) => option.value === 'custom-afternoon-tea')).toEqual([
      { value: 'custom-afternoon-tea', label: 'Afternoon Tea', defaultVisible: false },
    ]);
  });
  it('uses any Keep in an occupied slot and excludes its proposed portions', () => {
    const entries = [
      {
        entryKey: 'source',
        plannedFor: '2026-10-19',
        meal: 'dinner',
        title: 'Proposed dinner',
        servings: 4,
        newRecipeKey: 'new',
      },
      {
        entryKey: 'lunch',
        plannedFor: '2026-10-20',
        meal: 'lunch',
        title: 'Proposed lunch',
        servings: 2,
        newRecipeKey: 'new',
      },
    ];
    const conflicts = [
      { entryId: 'first', plannedFor: '2026-10-19', meal: 'dinner', title: 'Existing meal one' },
      { entryId: 'second', plannedFor: '2026-10-19', meal: 'dinner', title: 'Existing meal two' },
    ];
    const result = effectivePlanEntries(entries, conflicts, { first: 'replace', second: 'keep' });
    expect(result[0]).toMatchObject({ inserted: false, kept: [{ title: 'Existing meal two' }] });
    expect(result.filter((item) => item.inserted).map((item) => item.key)).toEqual(['lunch']);
  });
});
