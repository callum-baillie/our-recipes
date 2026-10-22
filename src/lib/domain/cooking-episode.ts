import { z } from 'zod';
import { kitchenPlanRequestSchema } from './kitchen';
const date = z.iso.date();
export const cookingRestrictionsSchema = z
  .object({
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid timezone.'),
    validOn: date,
    excludedEquipmentIds: z.array(z.uuid()).max(100),
    excludedCapabilities: z
      .array(
        z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9-]+$/),
      )
      .max(30),
  })
  .strict();
export type CookingRestrictions = z.infer<typeof cookingRestrictionsSchema>;
export function restrictionsApply(restriction: CookingRestrictions | null, now = new Date()) {
  if (!restriction) return false;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: restriction.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}` === restriction.validOn;
}
export const cookingEpisodeCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('restrictions'),
      operationId: z.uuid(),
      expectedContextRevision: z.number().int().nonnegative(),
      restrictions: cookingRestrictionsSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('accept-plan'),
      operationId: z.uuid(),
      expectedContextRevision: z.number().int().nonnegative(),
      plan: kitchenPlanRequestSchema,
    })
    .strict(),
]);
