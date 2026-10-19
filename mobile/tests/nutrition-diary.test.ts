import { describe, expect, it } from 'vitest';
import { diaryForDate, type DiaryEntry } from '../src/data/nutrition-diary';
const entry: DiaryEntry = {
  id: '1',
  seriesId: 'meal',
  revision: 1,
  occurredAt: '2026-10-17T02:00:00Z',
  state: 'eaten',
  sourceNameSnapshot: 'Soup',
  mealSlot: 'dinner',
  values: [{ nutrientCode: 'energy_kcal', amount: 250 }],
};
describe('nutrition diary', () => {
  it('uses the household timezone at midnight boundaries', () => {
    expect(
      diaryForDate({ intake: { revisions: [entry] } }, '2026-10-16', 'America/Chicago').totals
        .energy_kcal,
    ).toBe(250);
    expect(
      diaryForDate({ intake: { revisions: [entry] } }, '2026-10-17', 'America/Chicago').entries,
    ).toHaveLength(0);
  });
  it('only counts the latest revision and excludes deleted or skipped meals', () => {
    const revisions = [entry, { ...entry, revision: 2, state: 'deleted' }];
    expect(
      diaryForDate({ intake: { revisions } }, '2026-10-16', 'America/Chicago').entries,
    ).toHaveLength(0);
    revisions[1] = { ...entry, revision: 2, state: 'corrected' };
    expect(
      diaryForDate({ intake: { revisions } }, '2026-10-16', 'America/Chicago').totals.energy_kcal,
    ).toBe(250);
  });
  it('does not report absent nutrients as zero', () => {
    expect(diaryForDate(undefined, '2026-10-16').totals.energy_kcal).toBeUndefined();
  });
});
