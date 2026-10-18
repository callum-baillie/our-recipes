import 'server-only';
import { eq } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiRuntimeSettings, aiUserSettings, profileAuthLinks, user } from '@/lib/db/schema';
import { aiRuntimeSchema, aiUserPreferencesSchema } from '@/lib/domain/ai-runtime-settings';

export class AiAccessDeniedError extends Error {}

export function getGlobalAiPolicy() {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(aiRuntimeSettings)
    .where(eq(aiRuntimeSettings.id, 'global'))
    .get();
  return {
    settings: aiRuntimeSchema.parse(
      row
        ? JSON.parse(row.settings)
        : { batchMinItems: Math.min(50, Math.max(2, Number(process.env.AI_BATCH_MIN_ITEMS) || 2)) },
    ),
    version: row?.version ?? 0,
  };
}
export function getUserAiPolicy(userId: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(aiUserSettings)
    .where(eq(aiUserSettings.userId, userId))
    .get();
  const role = getDatabase()
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .get()?.role;
  return {
    enabled: row?.enabled ?? (role !== undefined && role !== 'child'),
    preferences: aiUserPreferencesSchema.parse(row ? JSON.parse(row.preferences) : {}),
    version: row?.version ?? 0,
  };
}
export function aiUserIdForProfile(profileId: string) {
  ensureDatabase();
  return getDatabase()
    .select()
    .from(profileAuthLinks)
    .where(eq(profileAuthLinks.profileId, profileId))
    .get()?.userId;
}
export function getEffectiveAiPolicy(profileId: string) {
  const global = getGlobalAiPolicy().settings;
  const userId = aiUserIdForProfile(profileId);
  const personal = userId ? getUserAiPolicy(userId) : null;
  return {
    ...global,
    ...(personal?.preferences.processing ?? {}),
    enabled: global.enabled && (personal?.enabled ?? process.env.NODE_ENV === 'test'),
    workloads: personal?.preferences.workloads ?? [],
  };
}
export function canAccountUseAi(userId: string): boolean {
  return getGlobalAiPolicy().settings.enabled && getUserAiPolicy(userId).enabled;
}
export function assertProfileAiEnabled(profileId: string) {
  const userId = aiUserIdForProfile(profileId);
  const account = userId
    ? getDatabase().select().from(user).where(eq(user.id, userId)).get()
    : null;
  if (!getEffectiveAiPolicy(profileId).enabled || account?.banned)
    throw new AiAccessDeniedError(
      'AI is disabled for this account. Ask an administrator to review AI access.',
    );
}
