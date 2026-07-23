import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const occurredAt = z.string().datetime({ offset: true });
const mealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']);
const reason = z.string().trim().min(1).max(500);
const idempotencyKey = z.string().trim().min(8).max(200);

export const nutritionDiaryCommandSchema = z.discriminatedUnion('command', [
  z
    .object({
      command: z.literal('copy_entry'),
      sourceRevisionId: uuid,
      targetProfileId: uuid.optional(),
      occurredAt,
      mealSlot,
      idempotencyKey,
    })
    .strict(),
  z
    .object({
      command: z.literal('copy_day'),
      sourceDate: isoDate,
      targetDate: isoDate,
      targetProfileId: uuid.optional(),
      idempotencyKey,
    })
    .strict(),
  z
    .object({
      command: z.literal('move'),
      sourceRevisionId: uuid,
      occurredAt,
      mealSlot,
      reason,
      idempotencyKey,
    })
    .strict(),
  z
    .object({
      command: z.literal('restore'),
      sourceRevisionId: uuid,
      reason,
      idempotencyKey,
    })
    .strict(),
  z
    .object({
      command: z.literal('reassign'),
      sourceRevisionId: uuid,
      targetProfileId: uuid,
      occurredAt,
      mealSlot,
      reason,
      idempotencyKey,
    })
    .strict(),
]);

export type NutritionDiaryCommand = z.output<typeof nutritionDiaryCommandSchema>;

export const nutritionProfileDeletionSchema = z
  .object({
    confirmation: z.string().min(1).max(220),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export type NutritionProfileDeletion = z.output<typeof nutritionProfileDeletionSchema>;

export function nutritionDiaryCommandTargetProfileId(
  sourceProfileId: string,
  command: NutritionDiaryCommand,
): string | null {
  return command.command === 'copy_entry' || command.command === 'copy_day'
    ? (command.targetProfileId ?? sourceProfileId)
    : command.command === 'reassign'
      ? command.targetProfileId
      : null;
}

export function moveNutritionLocalTimeToDate(
  source: Date,
  targetDate: string,
  sourceTimeZone: string,
  targetTimeZone: string,
): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: sourceTimeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(source);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? '0');
  const [year, month, day] = targetDate.split('-').map(Number) as [number, number, number];
  const wanted = Date.UTC(year, month - 1, day, part('hour'), part('minute'), part('second'));
  let candidate = wanted;
  const targetFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: targetTimeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = targetFormatter.formatToParts(new Date(candidate));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(actual.find((item) => item.type === type)?.value ?? '0');
    const represented = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    candidate += wanted - represented;
  }
  return new Date(candidate);
}
