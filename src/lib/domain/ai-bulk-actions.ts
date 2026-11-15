import { z } from 'zod';
export const bulkAppActionsSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    operationId: z.string().min(1).max(100),
    targets: z
      .array(
        z
          .object({ parametersJson: z.string().max(4000), bodyJson: z.string().max(60000) })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export function expandBulkAppActions(input: unknown) {
  const parsed = bulkAppActionsSchema.parse(input);
  return {
    title: parsed.title,
    actions: parsed.targets.map((target) => ({
      ...target,
      operationId: parsed.operationId,
      bindings: [],
    })),
  };
}
