import 'server-only';
import {
  currentAiExecutionContext,
  withAiExecutionContext,
  assertAiExecutionActive,
} from './ai-execution-context';
import { randomUUID } from 'node:crypto';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getDatabase, ensureDatabase } from '@/lib/db/client';
import { aiExecutionTraces } from '@/lib/db/schema';
import { AI_MODEL_CATALOG, type AiWorkload } from '@/lib/domain/ai-assistant';
import { aiApprovedExecutionSchema } from '@/lib/domain/ai-approved-execution';
import { DECISIONS_MODEL } from '@/lib/providers/decisions-provider';
import { getAiWorkloadSetting } from './ai-settings-service';
import {
  aiUserIdForProfile,
  assertProfileAiEnabled,
  getEffectiveAiPolicy,
  getGlobalAiPolicy,
} from './ai-access-service';

type Setting = ReturnType<typeof getAiWorkloadSetting>;
type Approved = Partial<Setting> & { personalInstructions?: string };

export function captureAiExecutionApproval(profileId: string, workload: AiWorkload) {
  assertProfileAiEnabled(profileId);
  const setting = getAiWorkloadSetting(profileId, workload);
  if (!setting.enabled) throw new Error('This AI workload is disabled for the account.');
  return aiApprovedExecutionSchema.parse({
    schemaVersion: 1,
    workload,
    model: setting.model,
    reasoningEffort: setting.reasoningEffort,
    promptGuidance: setting.promptGuidance,
    promptVersion: setting.promptVersion,
    personalInstructions: getEffectiveAiPolicy(profileId).instructions,
    maxOutputTokens: setting.maxOutputTokens,
    requestTimeoutSeconds: setting.requestTimeoutSeconds,
  });
}
export function resolveAiExecutionOptions(
  profileId: string,
  workload: AiWorkload,
  approved?: Approved,
) {
  assertAiExecutionActive();
  if (approved?.workload && approved.workload !== workload)
    throw new Error('The reviewed workload changed. Review a new request.');
  assertProfileAiEnabled(profileId);
  const current = getAiWorkloadSetting(profileId, workload);
  if (!current.enabled) throw new Error('This AI workload is disabled for the account.');
  const global = getGlobalAiPolicy().settings;
  const model = approved?.model ?? current.model;
  const reasoning =
    approved?.reasoningEffort === undefined ? current.reasoningEffort : approved.reasoningEffort;
  const capability = AI_MODEL_CATALOG.find((item) => item.id === model);
  if (
    capability &&
    (!(capability.workloads as readonly string[]).includes(workload) ||
      (reasoning && !(capability.reasoning as readonly string[]).includes(reasoning)))
  )
    throw new Error(
      'The reviewed model is incompatible with this workload. Review current settings.',
    );
  const fixedDecisionContract =
    currentAiExecutionContext()?.providerEndpoint === 'decisions' && model === DECISIONS_MODEL;
  if (
    !global.allowPersonalModelOverrides &&
    !fixedDecisionContract &&
    (model !== current.model || reasoning !== current.reasoningEffort)
  )
    throw new Error('The reviewed model or reasoning is no longer allowed. Review a new request.');
  if (
    workload === 'image_generation' &&
    !global.allowPersonalImageOverrides &&
    ((approved?.imageQuality ?? current.imageQuality) !== current.imageQuality ||
      (approved?.imageSize ?? current.imageSize) !== current.imageSize)
  )
    throw new Error('The reviewed image options are no longer allowed. Review a new request.');
  const snapshot = Object.fromEntries(
    Object.entries(approved ?? {}).filter(([, value]) => value !== undefined),
  ) as Approved;
  const context = currentAiExecutionContext();
  const timeout = Math.min(
    current.requestTimeoutSeconds ?? 180,
    approved?.requestTimeoutSeconds ?? Infinity,
  );
  const deadlineAt = Math.min(context?.deadlineAt ?? Infinity, Date.now() + timeout * 1000);
  const deadlineSignal = AbortSignal.timeout(Math.max(1, Math.floor(deadlineAt - Date.now())));
  const signal = context?.signal
    ? AbortSignal.any([context.signal, deadlineSignal])
    : deadlineSignal;
  const personal = approved?.personalInstructions ?? getEffectiveAiPolicy(profileId).instructions;
  return {
    ...current,
    ...snapshot,
    enabled: true,
    maxOutputTokens: Math.min(
      current.maxOutputTokens ?? 4096,
      approved?.maxOutputTokens ?? Infinity,
    ),
    requestTimeoutSeconds: Math.max(0.001, (deadlineAt - Date.now()) / 1000),
    promptGuidance: [
      approved?.promptGuidance ?? current.promptGuidance ?? '',
      personal
        ? `Personal presentation preferences are subordinate to permissions, evidence and the output contract: ${JSON.stringify(personal)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    signal,
    deadlineAt,
  };
}
/** Every paid provider boundary records only effective configuration and outcome. */
export async function executeAiWorkload<T>(
  profileId: string,
  workload: AiWorkload,
  run: (options: ReturnType<typeof resolveAiExecutionOptions>) => Promise<T>,
  approved?: Approved,
): Promise<T> {
  const options = resolveAiExecutionOptions(profileId, workload, approved);
  ensureDatabase();
  const id = randomUUID();
  const parent = currentAiExecutionContext();
  const owner = aiUserIdForProfile(profileId) ?? null;
  getDatabase().transaction(() => {
    const requestUnits = Math.max(1, Math.min(50, parent?.requestUnits ?? 1));
    const recent =
      getDatabase()
        .select({
          total: sql<number>`coalesce(sum(coalesce(json_extract(${aiExecutionTraces.optionsJson}, '$.requestUnits'), 1)),0)`,
        })
        .from(aiExecutionTraces)
        .where(
          and(
            owner
              ? eq(aiExecutionTraces.ownerUserId, owner)
              : eq(aiExecutionTraces.profileId, profileId),
            gte(aiExecutionTraces.createdAt, new Date(Date.now() - 600_000)),
          ),
        )
        .get()?.total ?? 0;
    if (recent + requestUnits > getEffectiveAiPolicy(profileId).generationsPerTenMinutes)
      throw new Error(
        'The account AI request limit has been reached. Wait before starting another request.',
      );
    getDatabase()
      .insert(aiExecutionTraces)
      .values({
        id,
        profileId,
        ownerUserId: aiUserIdForProfile(profileId) ?? null,
        parentTraceId: parent?.parentTraceId ?? null,
        parentJobId: parent?.parentJobId ?? null,
        turnId: parent?.turnId ?? null,
        workload,
        model: options.model,
        promptVersion: options.promptVersion ?? 'builtin',
        optionsJson: JSON.stringify({
          reasoningEffort: options.reasoningEffort,
          maxOutputTokens:
            parent?.providerEndpoint === 'decisions' || workload === 'image_generation'
              ? null
              : options.maxOutputTokens,
          providerEndpoint:
            parent?.providerEndpoint ?? (workload === 'image_generation' ? 'images' : 'responses'),
          outputContract:
            parent?.providerEndpoint === 'decisions'
              ? 'bounded choices; token cap unsupported'
              : undefined,
          requestTimeoutSeconds: options.requestTimeoutSeconds,
          deadlineAt: options.deadlineAt,
          imageQuality: options.imageQuality,
          imageSize: options.imageSize,
          fallback: 'none',
          requestUnits,
          submittedConfigurations: parent?.submittedConfigurations,
        }),
        status: 'requested',
        createdAt: new Date(),
      })
      .run();
  });
  try {
    const result = await withAiExecutionContext(
      {
        ...parent,
        parentTraceId: id,
        signal: options.signal,
        deadlineAt: options.deadlineAt,
        requestUnits: 1,
        submittedConfigurations: undefined,
      },
      () => run(options),
    );
    options.signal.throwIfAborted();
    assertAiExecutionActive();
    getDatabase()
      .update(aiExecutionTraces)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(aiExecutionTraces.id, id))
      .run();
    return result;
  } catch (error) {
    getDatabase()
      .update(aiExecutionTraces)
      .set({ status: options.signal.aborted ? 'cancelled' : 'failed', completedAt: new Date() })
      .where(eq(aiExecutionTraces.id, id))
      .run();
    throw error;
  }
}
