import { validDate } from './meal-entry';
export function localTimestamp(date: string, time: string) {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time))
    throw new Error('Enter a valid date and time (HH:MM).');
  const timestamp = new Date(`${date}T${time}:00`);
  if (
    timestamp.getHours() !== Number(time.slice(0, 2)) ||
    timestamp.getMinutes() !== Number(time.slice(3))
  )
    throw new Error('That local time does not exist. Choose another time.');
  return timestamp.toISOString();
}
export function positiveNumber(value: string, label: string, max = 1_000_000) {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number <= 0 || number > max)
    throw new Error(`${label} must be greater than zero and no more than ${max}.`);
  return number;
}
export function latestRevisions<T extends { seriesId: string; revision: number }>(revisions: T[]) {
  const latest = new Map<string, T>();
  for (const item of revisions)
    if ((latest.get(item.seriesId)?.revision ?? -1) < item.revision)
      latest.set(item.seriesId, item);
  return [...latest.values()];
}
export function nutrientValues(values: Record<string, string>) {
  const output = Object.entries(values)
    .filter(([, value]) => value.trim())
    .map(([nutrientCode, value]) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000)
        throw new Error('Nutrients must be valid nonnegative numbers.');
      return { nutrientCode, amount };
    });
  if (!output.length)
    throw new Error('Enter at least one nutrient amount. Leave unknown nutrients blank.');
  return output;
}
