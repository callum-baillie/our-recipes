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
  allowPersonalModelOverrides: z.boolean().default(true),
  maxOutputTokens: z.number().int().min(512).max(16384).default(4096),
  requestTimeoutSeconds: z.number().int().min(15).max(300).default(180),
  toolRoundLimit: z.number().int().min(1).max(12).default(8),
  imageQuality: z.enum(['low', 'medium', 'high']).default('low'),
  imageSize: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024'),
  allowPersonalImageOverrides: z.boolean().default(false),
});
export const aiUserPreferencesSchema = z
  .object({
    processing: aiProcessingSchema.nullable().default(null),
    workloads: z.array(aiWorkloadSettingSchema).max(7).default([]),
    instructions: z.string().trim().max(2000).default(''),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.workloads.map((item) => item.workload)).size === value.workloads.length,
    'Choose each task once.',
  );
export type AiRuntimeSettings = z.infer<typeof aiRuntimeSchema>;
export type AiUserPreferences = z.infer<typeof aiUserPreferencesSchema>;
