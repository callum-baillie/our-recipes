import { z } from 'zod';
import { isNutritionDate, nutritionEventCandidates, nutritionWallTime } from './nutrition-ui';

const uuid = z.string().uuid();
const isoDate = z.string().refine(isNutritionDate, 'Enter a valid calendar date.');
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
  const local = nutritionWallTime(source, sourceTimeZone);
  const candidates = nutritionEventCandidates(`${targetDate}T${local.slice(11)}`, targetTimeZone);
  if (!candidates.length)
    throw new RangeError(
      `The copied ${local.slice(11)} time does not exist on ${targetDate} in ${targetTimeZone}. Choose another date or copy entries individually.`,
    );
  // A copied repeated clock time uses its earlier occurrence; the UI explains this rule.
  return new Date(
    Date.parse(candidates[0]!) + source.getUTCSeconds() * 1000 + source.getUTCMilliseconds(),
  );
}
