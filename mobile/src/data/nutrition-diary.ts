export type DiaryEntry = {
  id: string;
  seriesId: string;
  revision: number;
  occurredAt: string;
  state: string;
  sourceNameSnapshot: string;
  mealSlot: string;
  values: { nutrientCode: string; amount: number; estimated?: boolean }[];
};

export function diaryForDate(dataset: unknown, date: string, timeZone?: string) {
  const cached = dataset as
    | {
        intake?: { revisions?: DiaryEntry[] };
        detail?: { profile?: { dailyResetTimezone?: string } };
      }
    | undefined;
  const zone = cached?.detail?.profile?.dailyResetTimezone ?? timeZone;
  const latest = new Map<string, DiaryEntry>();
  for (const entry of cached?.intake?.revisions ?? []) {
    if (!entry || typeof entry.seriesId !== 'string' || !Number.isFinite(entry.revision)) continue;
    if ((latest.get(entry.seriesId)?.revision ?? -1) < entry.revision)
      latest.set(entry.seriesId, entry);
  }
  const entries = [...latest.values()].filter((entry) => {
    if (!['eaten', 'corrected'].includes(entry.state)) return false;
    const timestamp = new Date(entry.occurredAt);
    if (Number.isNaN(timestamp.getTime())) return false;
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(timestamp);
    } catch {
      return false;
    }
    const part = (type: string) => parts.find((value) => value.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}` === date;
  });
  const totals: Record<string, number> = {};
  for (const entry of entries)
    for (const value of entry.values ?? []) {
      if (Number.isFinite(value.amount))
        totals[value.nutrientCode] = (totals[value.nutrientCode] ?? 0) + value.amount;
    }
  return { entries, totals, available: Array.isArray(cached?.intake?.revisions) };
}
