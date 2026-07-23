import 'server-only';

import { and, eq } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiProfileSettings, aiWorkloadSettings } from '@/lib/db/schema';
import {
  AI_MODEL_CATALOG,
  AI_WORKLOAD_DEFAULTS,
  DEFAULT_AI_DATA_POLICY,
  aiDataPolicySchema,
  aiSettingsUpdateSchema,
  aiWorkloadSchema,
  type AiDataPolicy,
  type AiReasoningEffort,
  type AiWorkload,
} from '@/lib/domain/ai-assistant';

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
  const setting = getAiWorkloadSettings(profileId).find((item) => item.workload === workload);
  if (!setting) throw new AiSettingsValidationError(`AI workload ${workload} is unavailable.`);
  return setting;
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
    dailySummaryEnabled: row.dailySummaryEnabled,
    weeklySummaryEnabled: row.weeklySummaryEnabled,
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
    }
  });
  return getAiSettings(profileId);
}
