import 'server-only';
import { getEffectiveAiPolicy } from './ai-access-service';
import { eq } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { taskPreferences } from '@/lib/db/schema';
import { taskSettingsSchema, type TaskSettings } from '@/lib/domain/task-settings';
import type { RequestPrincipal } from './auth-service';
export function getTaskSettings(profileId: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(taskPreferences)
    .where(eq(taskPreferences.profileId, profileId))
    .get();
  const effective = getEffectiveAiPolicy(profileId);
  return {
    settings: {
      ...taskSettingsSchema.parse(
        row
          ? JSON.parse(row.settings)
          : {
              batchMinItems: Math.min(50, Math.max(2, Number(process.env.AI_BATCH_MIN_ITEMS) || 2)),
            },
      ),
      executionMode: effective.executionMode,
      batchMinItems: effective.batchMinItems,
    },
    version: row?.version ?? 0,
    lastScheduledDate: row?.lastScheduledDate ?? null,
  };
}
export function saveTaskSettings(
  principal: RequestPrincipal,
  settings: TaskSettings,
  expectedVersion: number,
) {
  ensureDatabase();
  const parsed = taskSettingsSchema.parse(settings);
  if (principal.role === 'child' || principal.accountRole === 'child')
    throw new Error('Only adult accounts can schedule AI tasks.');
  // Personal automation is tied to the authenticated account, not the switchable profile cookie.
  const profileId = principal.linkedProfileId;
  return getDatabase().transaction((transaction) => {
    const current = transaction
      .select()
      .from(taskPreferences)
      .where(eq(taskPreferences.profileId, profileId))
      .get();
    if ((current?.version ?? 0) !== expectedVersion)
      throw new Error('These settings changed. Reload before saving.');
    // Scheduling owns only scheduling. Compatibility fields cannot overwrite AI preferences.
    const effective = getEffectiveAiPolicy(profileId);
    parsed.executionMode = effective.executionMode;
    parsed.batchMinItems = effective.batchMinItems;
    transaction
      .insert(taskPreferences)
      .values({
        profileId,
        userId: principal.userId,
        settings: JSON.stringify(parsed),
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: taskPreferences.profileId,
        set: {
          userId: principal.userId,
          settings: JSON.stringify(parsed),
          version: expectedVersion + 1,
          updatedAt: new Date(),
        },
      })
      .run();
    return {
      settings: parsed,
      version: expectedVersion + 1,
      lastScheduledDate: current?.lastScheduledDate ?? null,
    };
  });
}
export function taskExecutionMode(profileId: string, count: number): 'direct' | 'batch' {
  const settings = getEffectiveAiPolicy(profileId);
  return settings.executionMode === 'auto'
    ? count >= settings.batchMinItems
      ? 'batch'
      : 'direct'
    : settings.executionMode;
}
