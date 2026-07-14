import { z } from 'zod';

export const backupIdSchema = z.string().uuid();
export const restoreConfirmationSchema = z.object({ confirmation: z.literal('RESTORE') });

export const backupManifestSchema = z.object({
  formatVersion: z.literal(1),
  id: backupIdSchema,
  applicationVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  reason: z.enum(['manual', 'scheduled', 'pre-restore']),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(1_024),
        bytes: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(2)
    .max(10_000),
  safeConfiguration: z.object({
    householdName: z.string().nullable(),
    appName: z.string().nullable(),
  }),
});

export type BackupManifest = z.infer<typeof backupManifestSchema>;
