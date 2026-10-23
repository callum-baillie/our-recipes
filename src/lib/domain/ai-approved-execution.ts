import { z } from 'zod';
import { aiWorkloadSchema } from './ai-assistant';

/** Durable configuration approved when a delayed operation is materialized. */
export const aiApprovedExecutionSchema = z
  .object({
    schemaVersion: z.literal(1),
    workload: aiWorkloadSchema,
    model: z.string().min(1).max(160),
    reasoningEffort: z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']).nullable(),
    promptGuidance: z.string().max(12000),
    promptVersion: z.string().min(1).max(160),
    personalInstructions: z.string().max(2000),
    maxOutputTokens: z.number().int().min(512).max(16384),
    requestTimeoutSeconds: z.number().int().min(15).max(300),
  })
  .strict();

export type AiApprovedExecution = z.infer<typeof aiApprovedExecutionSchema>;
