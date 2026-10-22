import { z } from 'zod';
export const cookingPreferencesSchema = z
  .object({
    methodPreferences: z.string().trim().max(800).default(''),
    priorities: z
      .array(
        z.enum([
          'less-cleanup',
          'fewer-pans',
          'shorter-elapsed',
          'less-hands-on',
          'batch-preparation',
          'less-chopping',
          'lighter-cookware',
        ]),
      )
      .max(7)
      .default([]),
    typicalMinutes: z.number().int().min(1).max(1440).nullable().default(null),
    maxHandsOn: z.number().int().min(1).max(8).default(1),
    confidence: z
      .enum(['learning', 'comfortable', 'experienced', 'unspecified'])
      .default('unspecified'),
    instructionDetail: z.enum(['brief', 'standard', 'detailed']).default('standard'),
    equipmentPolicy: z.enum(['recorded-only', 'ask-about-missing']).default('ask-about-missing'),
  })
  .strict();
export type CookingPreferences = z.infer<typeof cookingPreferencesSchema>;
export const cookingPreferencesUpdateSchema = z
  .object({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    preferences: cookingPreferencesSchema,
  })
  .strict();
