import { describe, expect, it } from 'vitest';

import { addLocalDateDays, localIsoDate, localWeekRange } from '@/lib/domain/local-date';

describe('household local dates', () => {
  it('uses the requested zone on both sides of UTC midnight', () => {
    const instant = new Date('2026-07-21T01:30:00Z');
    expect(localIsoDate(instant, 'America/Los_Angeles')).toBe('2026-07-20');
    expect(localIsoDate(instant, 'Pacific/Kiritimati')).toBe('2026-07-21');
  });

  it('keeps calendar arithmetic stable across DST and both supported week starts', () => {
    expect(addLocalDateDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(localWeekRange('2026-03-08', 0)).toEqual({
      weekStart: '2026-03-08',
      weekEnd: '2026-03-14',
    });
    expect(localWeekRange('2026-03-08', 1)).toEqual({
      weekStart: '2026-03-02',
      weekEnd: '2026-03-08',
    });
  });
});
