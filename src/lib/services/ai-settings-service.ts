import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  aiProfileSettings,
  aiSummaryJobs,
  aiWorkloadSettings,
  aiRuntimeSettings,
  aiUserSettings,
  user,
} from '@/lib/db/schema';
import {
  AI_MODEL_CATALOG,
  AI_SUMMARY_FREQUENCY_MS,
  AI_WORKLOAD_DEFAULTS,
  DEFAULT_AI_DATA_POLICY,
  aiDataPolicySchema,
  aiSettingsUpdateSchema,
  aiWorkloadSchema,
  type AiDataPolicy,
  type AiReasoningEffort,
  type AiWorkload,
} from '@/lib/domain/ai-assistant';

import { getEffectiveAiPolicy, getGlobalAiPolicy, getUserAiPolicy } from './ai-access-service';
import { aiRuntimeSchema, aiUserPreferencesSchema } from '@/lib/domain/ai-runtime-settings';

export class AiSettingsConflictError extends Error {}
export class AiSettingsValidationError extends Error {}

export type AiWorkloadSetting = {
  workload: AiWorkload;
  model: string;
  reasoningEffort: AiReasoningEffort | null;
  enabled: boolean;
  version: number;
};

function db() {
  ensureDatabase();
  return getDatabase();
}

function assertCompatible(
  workload: AiWorkload,
  model: string,
  reasoningEffort: AiReasoningEffort | null,
): void {
  const known = AI_MODEL_CATALOG.find((candidate) => candidate.id === model);
  if (!known) return;
  if (!(known.workloads as readonly string[]).includes(workload)) {
    throw new AiSettingsValidationError(`${model} cannot be used for ${workload}.`);
  }
  if (reasoningEffort && !(known.reasoning as readonly string[]).includes(reasoningEffort)) {
    throw new AiSettingsValidationError(`${model} does not support that reasoning setting.`);
  }
}

function ensureWorkloads(profileId: string): void {
  const database = db();
  const now = new Date();
  for (const workload of aiWorkloadSchema.options) {
    const existing = database
      .select({ workload: aiWorkloadSettings.workload })
      .from(aiWorkloadSettings)
      .where(eq(aiWorkloadSettings.workload, workload))
      .get();
    if (existing) continue;
    const defaults = AI_WORKLOAD_DEFAULTS[workload];
    database
      .insert(aiWorkloadSettings)
      .values({
        workload,
        model: defaults.model,
        reasoningEffort: defaults.reasoningEffort,
        enabled: true,
        version: 1,
        updatedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

function ensureProfilePolicy(profileId: string): void {
  const database = db();
  const existing = database
    .select({ profileId: aiProfileSettings.profileId })
    .from(aiProfileSettings)
    .where(eq(aiProfileSettings.profileId, profileId))
    .get();
  if (existing) return;
  const now = new Date();
  database
    .insert(aiProfileSettings)
    .values({
      profileId,
      ...DEFAULT_AI_DATA_POLICY,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

export function getAiWorkloadSettings(profileId: string): AiWorkloadSetting[] {
  ensureWorkloads(profileId);
  return db()
    .select()
    .from(aiWorkloadSettings)
    .all()
    .map((row) => ({
      workload: aiWorkloadSchema.parse(row.workload),
      model: row.model,
      reasoningEffort: row.reasoningEffort ? (row.reasoningEffort as AiReasoningEffort) : null,
      enabled: row.enabled,
      version: row.version,
    }))
    .sort(
      (left, right) =>
        aiWorkloadSchema.options.indexOf(left.workload) -
        aiWorkloadSchema.options.indexOf(right.workload),
    );
}

export function getAiWorkloadSetting(profileId: string, workload: AiWorkload): AiWorkloadSetting {
  const policy = getEffectiveAiPolicy(profileId);
  const setting = getAiWorkloadSettings(profileId).find((item) => item.workload === workload);
  if (!setting) throw new AiSettingsValidationError(`AI workload ${workload} is unavailable.`);
  const override = policy.workloads.find((item) => item.workload === workload);
  const effective = override
    ? { ...override, enabled: setting.enabled && override.enabled }
    : setting;
  return { ...effective, enabled: effective.enabled && policy.enabled };
}

export function getAiDataPolicy(profileId: string): AiDataPolicy {
  ensureProfilePolicy(profileId);
  const row = db()
    .select()
    .from(aiProfileSettings)
    .where(eq(aiProfileSettings.profileId, profileId))
    .get();
  if (!row) throw new AiSettingsValidationError('AI profile settings are unavailable.');
  return aiDataPolicySchema.parse({
    shareSharedRecipes: row.shareSharedRecipes,
    shareMealPlans: row.shareMealPlans,
    shareDietaryPreferences: row.shareDietaryPreferences,
    shareRecipePreferences: row.shareRecipePreferences,
    shareProfileGoals: row.shareProfileGoals,
    shareNutritionGoals: row.shareNutritionGoals,
    shareNutritionAggregates: row.shareNutritionAggregates,
    shareRawDiary: row.shareRawDiary,
    shareIdentity: row.shareIdentity,
    sharePersonalMetrics: row.sharePersonalMetrics,
    shareWeight: row.shareWeight,
    shareShoppingLists: row.shareShoppingLists,
    sharePantry: row.sharePantry,
    dailySummaryEnabled: row.dailySummaryEnabled,
    weeklySummaryEnabled: row.weeklySummaryEnabled,
    summaryFrequency: row.summaryFrequency,
    summaryNutritionEnabled: row.summaryNutritionEnabled,
    summaryMealPlansEnabled: row.summaryMealPlansEnabled,
    summaryShoppingListsEnabled: row.summaryShoppingListsEnabled,
    summaryRecipesEnabled: row.summaryRecipesEnabled,
    version: row.version,
  });
}

export function getAiSettings(profileId: string) {
  return {
    workloads: getAiWorkloadSettings(profileId),
    dataPolicy: getAiDataPolicy(profileId),
    modelCatalog: AI_MODEL_CATALOG,
  };
}

export function updateAiSettings(profileId: string, raw: unknown) {
  const input = aiSettingsUpdateSchema.parse(raw);
  ensureWorkloads(profileId);
  ensureProfilePolicy(profileId);
  const database = db();
  database.transaction((transaction) => {
    const now = new Date();
    for (const item of input.workloads ?? []) {
      assertCompatible(item.workload, item.model, item.reasoningEffort);
      const result = transaction
        .update(aiWorkloadSettings)
        .set({
          model: item.model,
          reasoningEffort: item.reasoningEffort,
          enabled: item.enabled,
          version: item.version + 1,
          updatedByProfileId: profileId,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiWorkloadSettings.workload, item.workload),
            eq(aiWorkloadSettings.version, item.version),
          ),
        )
        .run();
      if (result.changes !== 1) {
        throw new AiSettingsConflictError('AI model settings changed in another tab.');
      }
    }
    if (input.dataPolicy) {
      const { version, ...values } = input.dataPolicy;
      const previous = transaction
        .select({ summaryFrequency: aiProfileSettings.summaryFrequency })
        .from(aiProfileSettings)
        .where(eq(aiProfileSettings.profileId, profileId))
        .get();
      const result = transaction
        .update(aiProfileSettings)
        .set({ ...values, version: version + 1, updatedAt: now })
        .where(
          and(eq(aiProfileSettings.profileId, profileId), eq(aiProfileSettings.version, version)),
        )
        .run();
      if (result.changes !== 1) {
        throw new AiSettingsConflictError('AI data settings changed in another tab.');
      }
      if (values.summaryFrequency === 'off') {
        transaction.delete(aiSummaryJobs).where(eq(aiSummaryJobs.profileId, profileId)).run();
      } else if (previous?.summaryFrequency !== values.summaryFrequency) {
        const dueAt = new Date(now.getTime() + AI_SUMMARY_FREQUENCY_MS[values.summaryFrequency]);
        const existing = transaction
          .select({ id: aiSummaryJobs.id })
          .from(aiSummaryJobs)
          .where(eq(aiSummaryJobs.profileId, profileId))
          .get();
        if (existing) {
          transaction
            .update(aiSummaryJobs)
            .set({
              kind: 'summary_bundle',
              dueAt,
              status: 'pending',
              leaseUntil: null,
              leaseToken: null,
              attempts: 0,
              errorCode: null,
              updatedAt: now,
            })
            .where(eq(aiSummaryJobs.id, existing.id))
            .run();
        } else {
          transaction
            .insert(aiSummaryJobs)
            .values({
              id: randomUUID(),
              profileId,
              kind: 'summary_bundle',
              dueAt,
              status: 'pending',
              leaseUntil: null,
              leaseToken: null,
              attempts: 0,
              errorCode: null,
              updatedAt: now,
            })
            .run();
        }
      }
    }
  });
  return getAiSettings(profileId);
}

export function getGlobalAiSettings(profileId: string) {
  return {
    ...getGlobalAiPolicy(),
    workloads: getAiWorkloadSettings(profileId),
    modelCatalog: AI_MODEL_CATALOG,
    users: db()
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .all()
      .map((account) => ({ ...account, ...getUserAiPolicy(account.id) })),
  };
}
export function saveGlobalAiSettings(profileId: string, raw: unknown) {
  const input = globalAiUpdateSchema.parse(raw);
  db().transaction((transaction) => {
    const previous = getGlobalAiPolicy();
    if (previous.version !== input.version)
      throw new AiSettingsConflictError('Global settings changed. Reload before saving.');
    if (input.workloads) updateAiSettings(profileId, { workloads: input.workloads });
    transaction
      .insert(aiRuntimeSettings)
      .values({
        id: 'global',
        settings: JSON.stringify(input.settings),
        version: input.version + 1,
      })
      .onConflictDoUpdate({
        target: aiRuntimeSettings.id,
        set: { settings: JSON.stringify(input.settings), version: input.version + 1 },
      })
      .run();
    for (const account of input.users) {
      if (!transaction.select().from(user).where(eq(user.id, account.id)).get())
        throw new AiSettingsValidationError('Account no longer exists.');
      const current = getUserAiPolicy(account.id);
      if (current.version !== account.version)
        throw new AiSettingsConflictError('Account settings changed. Reload before saving.');
      transaction
        .insert(aiUserSettings)
        .values({
          userId: account.id,
          enabled: account.enabled,
          preferences: JSON.stringify(current.preferences),
          version: current.version + 1,
        })
        .onConflictDoUpdate({
          target: aiUserSettings.userId,
          set: { enabled: account.enabled, version: current.version + 1 },
        })
        .run();
    }
  });
  return getGlobalAiSettings(profileId);
}
export function getPersonalAiSettings(userId: string, profileId: string) {
  return {
    ...getAiSettings(profileId),
    account: getUserAiPolicy(userId),
    global: getGlobalAiPolicy().settings,
  };
}
export function savePersonalAiSettings(userId: string, profileId: string, raw: unknown) {
  const privacyOnly = aiSettingsUpdateSchema.safeParse(raw);
  if (privacyOnly.success && privacyOnly.data.dataPolicy && !privacyOnly.data.workloads) {
    updateAiSettings(profileId, { dataPolicy: privacyOnly.data.dataPolicy });
    return getPersonalAiSettings(userId, profileId);
  }
  const input = personalAiUpdateSchema.parse(raw);
  db().transaction((transaction) => {
    const previous = getUserAiPolicy(userId);
    if (previous.version !== input.version)
      throw new AiSettingsConflictError('Personal settings changed. Reload before saving.');
    input.preferences.workloads.forEach((item) =>
      assertCompatible(item.workload, item.model, item.reasoningEffort),
    );
    if (input.dataPolicy) updateAiSettings(profileId, { dataPolicy: input.dataPolicy });
    transaction
      .insert(aiUserSettings)
      .values({
        userId,
        enabled: previous.enabled,
        preferences: JSON.stringify(input.preferences),
        version: previous.version + 1,
      })
      .onConflictDoUpdate({
        target: aiUserSettings.userId,
        set: { preferences: JSON.stringify(input.preferences), version: previous.version + 1 },
      })
      .run();
  });
  return getPersonalAiSettings(userId, profileId);
}

const globalAiUpdateSchema = z
  .object({
    settings: aiRuntimeSchema,
    version: z.number().int().min(0),
    workloads: aiSettingsUpdateSchema.shape.workloads,
    users: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            enabled: z.boolean(),
            version: z.number().int().min(0),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
const personalAiUpdateSchema = z
  .object({
    preferences: aiUserPreferencesSchema,
    version: z.number().int().min(0),
    dataPolicy: aiDataPolicySchema.optional(),
  })
  .strict();
