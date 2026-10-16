import { z } from 'zod';
export const taskSettingsSchema = z
  .object({
    executionMode: z.enum(['auto', 'direct', 'batch']).default('auto'),
    batchMinItems: z.number().int().min(2).max(50).default(4),
    weeklyPlanEnabled: z.boolean().default(false),
    allowPaidGeneration: z.boolean().default(false),
    weekday: z.number().int().min(0).max(6).default(0),
    hour: z.number().int().min(0).max(23).default(9),
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid timezone.')
      .default('America/Chicago'),
    days: z.number().int().min(1).max(7).default(7),
    aheadDays: z.number().int().min(0).max(14).default(1),
    servings: z.number().int().min(1).max(100).default(2),
    mealSlots: z
      .array(z.enum(['breakfast', 'lunch', 'dinner', 'dessert', 'snack']))
      .min(1)
      .max(5)
      .default(['dinner']),
    selectedProfileIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    sourceMode: z.enum(['existing', 'mix', 'new']).default('existing'),
    instructions: z.string().trim().max(2000).default(''),
  })
  .strict()
  .refine(
    (value) => !value.weeklyPlanEnabled || value.allowPaidGeneration,
    'Authorize paid generation before enabling scheduled AI plans.',
  );
export type TaskSettings = z.infer<typeof taskSettingsSchema>;
