import { z } from 'zod';

export const clarificationSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    answers: z.array(z.string().trim().min(1).max(160)).min(2).max(5),
  })
  .strict();
const marker = '\n<!--bord-question:';
export function chatQuestion(content: string) {
  const index = content.lastIndexOf(marker);
  if (index < 0) return { text: content, question: null };
  try {
    const question = clarificationSchema.parse(
      JSON.parse(content.slice(index + marker.length, -3)),
    );
    return { text: content.slice(0, index), question };
  } catch {
    return { text: content, question: null };
  }
}
export function questionContent(question: z.infer<typeof clarificationSchema>) {
  return `${question.question}${marker}${JSON.stringify(question)}-->`;
}

/** Resolve a day-only range against an ISO local date, including month/year rollover. */
export function nextDayRange(startDay: number, endDay: number, today: string) {
  if (![startDay, endDay].every((day) => Number.isInteger(day) && day >= 1 && day <= 31))
    return null;
  const [year, month] = today.split('-').map(Number);
  for (let offset = 0; offset < 24; offset++) {
    const start = new Date(Date.UTC(year, month - 1 + offset, startDay));
    if (start.getUTCDate() !== startDay) continue;
    const startIso = start.toISOString().slice(0, 10);
    if (startIso < today) continue;
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (endDay < startDay ? 1 : 0), endDay),
    );
    if (end.getUTCDate() !== endDay) continue;
    return { start: startIso, end: end.toISOString().slice(0, 10) };
  }
  return null;
}
