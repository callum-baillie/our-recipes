export type NutritionDiaryValue = {
  nutrientCode: string;
  amount: number;
  confidence: number;
  completeness: number;
  estimated: boolean;
};

export type NutritionDiaryRevision = {
  id: string;
  seriesId: string;
  revision: number;
  occurredAt: Date;
  state: 'eaten' | 'skipped' | 'corrected' | 'deleted';
  sourceNameSnapshot: string;
  mealSlot: string;
  values: readonly NutritionDiaryValue[];
};

export type NutritionTrendDay = {
  date: string;
  energyKcal: number | null;
  entryCount: number;
};

export type NutritionDiarySummary = {
  currentEntries: NutritionDiaryRevision[];
  consumedEntries: NutritionDiaryRevision[];
  todayTotals: Record<string, number>;
  sevenDayTotals: Record<string, number>;
  trend: NutritionTrendDay[];
  averageCompleteness: number | null;
  averageConfidence: number | null;
  hasEstimatedValues: boolean;
};

export function nutritionLocalDateKey(value: Date, timeZone: string): string {
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

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function latestBySeries<T extends { seriesId: string; revision: number }>(rows: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const previous = latest.get(row.seriesId);
    if (!previous || row.revision > previous.revision) latest.set(row.seriesId, row);
  }
  return [...latest.values()];
}

function addValues(target: Record<string, number>, values: readonly NutritionDiaryValue[]) {
  for (const value of values) {
    target[value.nutrientCode] = (target[value.nutrientCode] ?? 0) + value.amount;
  }
}

export function summarizeNutritionDiary(
  revisions: readonly NutritionDiaryRevision[],
  options: { now?: Date; timeZone: string; days?: number },
): NutritionDiarySummary {
  const now = options.now ?? new Date();
  const days = options.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error('Nutrition trend days must be between 1 and 366.');
  }
  const today = nutritionLocalDateKey(now, options.timeZone);
  const trendDates = Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  const trendSet = new Set(trendDates);
  const currentEntries = latestBySeries(revisions).sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
  );
  const consumedEntries = currentEntries.filter(
    (entry) => entry.state === 'eaten' || entry.state === 'corrected',
  );
  const todayTotals: Record<string, number> = {};
  const sevenDayTotals: Record<string, number> = {};
  const trend = new Map<string, NutritionTrendDay>(
    trendDates.map((date) => [date, { date, energyKcal: null, entryCount: 0 }]),
  );
  const quality: NutritionDiaryValue[] = [];
  for (const entry of consumedEntries) {
    const key = nutritionLocalDateKey(entry.occurredAt, options.timeZone);
    if (key === today) {
      addValues(todayTotals, entry.values);
      quality.push(...entry.values);
    }
    if (trendSet.has(key)) {
      addValues(sevenDayTotals, entry.values);
      const day = trend.get(key)!;
      day.entryCount += 1;
      const energy = entry.values.find((value) => value.nutrientCode === 'energy_kcal');
      if (energy) day.energyKcal = (day.energyKcal ?? 0) + energy.amount;
    }
  }
  const average = (selector: (value: NutritionDiaryValue) => number) =>
    quality.length === 0
      ? null
      : quality.reduce((total, value) => total + selector(value), 0) / quality.length;
  return {
    currentEntries,
    consumedEntries,
    todayTotals,
    sevenDayTotals,
    trend: [...trend.values()],
    averageCompleteness: average((value) => value.completeness),
    averageConfidence: average((value) => value.confidence),
    hasEstimatedValues: quality.some((value) => value.estimated),
  };
}

export function latestNutritionSeries<T extends { seriesId: string; revision: number }>(
  rows: readonly T[],
): T[] {
  return latestBySeries(rows);
}
