import { describe, expect, it } from 'vitest';
import { localDate, shiftDate, weekDays } from '../src/data/planner';
describe('mobile planner calendar', () => {
  it('includes both weekend days and starts on Monday', () => {
    expect(weekDays('2026-10-18').map((day) => day.iso)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });
  it('navigates across year and leap-day boundaries', () => {
    expect(shiftDate('2026-12-28', 7)).toBe('2027-01-04');
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29');
  });
  it('uses local calendar components', () => {
    expect(localDate(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16');
  });
});
