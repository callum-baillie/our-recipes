export function localIsoDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addLocalDateDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function localWeekRange(today: string, weekStartsOn: 0 | 1) {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = addLocalDateDays(today, -((day - weekStartsOn + 7) % 7));
  return { weekStart, weekEnd: addLocalDateDays(weekStart, 6) };
}
