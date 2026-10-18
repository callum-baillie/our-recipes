import { z } from 'zod';
import { aiWorkloadSettingSchema } from './ai-assistant';

export const aiProcessingSchema = z
  .object({
    executionMode: z.enum(['auto', 'direct', 'batch']).default('auto'),
    batchMinItems: z.number().int().min(2).max(50).default(2),
  })
  .strict();
export const aiRuntimeSchema = aiProcessingSchema.extend({
  enabled: z.boolean().default(true),
  generationsPerTenMinutes: z.number().int().min(1).max(100).default(10),
});
export const aiUserPreferencesSchema = z
  .object({
    processing: aiProcessingSchema.nullable().default(null),
    workloads: z.array(aiWorkloadSettingSchema).max(7).default([]),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.workloads.map((item) => item.workload)).size === value.workloads.length,
    'Choose each task once.',
  );
export type AiRuntimeSettings = z.infer<typeof aiRuntimeSchema>;
export type AiUserPreferences = z.infer<typeof aiUserPreferencesSchema>;
