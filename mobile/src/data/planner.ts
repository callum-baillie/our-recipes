export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekDays(anchor: string, startsOn: 0 | 1 = 1, count = 7) {
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() - startsOn + 7) % 7));
  return Array.from({ length: count }, (_, offset) => {
    const day = new Date(date);
    day.setDate(day.getDate() + offset);
    return {
      iso: localDate(day),
      number: day.getDate(),
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
    };
  });
}

export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
