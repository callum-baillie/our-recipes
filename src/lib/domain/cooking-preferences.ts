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
/** Reviewed writes require every owned field; omission must never reset hidden defaults. */
const cookingPreferencesWriteSchema = z
  .object({
    methodPreferences: cookingPreferencesSchema.shape.methodPreferences.removeDefault(),
    priorities: cookingPreferencesSchema.shape.priorities.removeDefault(),
    typicalMinutes: cookingPreferencesSchema.shape.typicalMinutes.removeDefault(),
    maxHandsOn: cookingPreferencesSchema.shape.maxHandsOn.removeDefault(),
    confidence: cookingPreferencesSchema.shape.confidence.removeDefault(),
    instructionDetail: cookingPreferencesSchema.shape.instructionDetail.removeDefault(),
    equipmentPolicy: cookingPreferencesSchema.shape.equipmentPolicy.removeDefault(),
  })
  .strict();
export const cookingPreferencesUpdateSchema = z
  .object({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    preferences: cookingPreferencesWriteSchema,
  })
  .strict();
