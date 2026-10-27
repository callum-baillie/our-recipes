import { kitchens, profiles as householdProfilesTable } from '@/lib/db/schema';
import { executeAiWorkload, resolveAiExecutionOptions } from './ai-execution-service';
import { withAiExecutionContext } from './ai-execution-context';
import { getRecipe } from './recipe-service';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { appRoleCan } from '@/lib/domain/permissions';
import { currentAiExecutionContext, assertAiExecutionActive } from './ai-execution-context';
import { RECIPE_IMAGE_PROMPT_VERSION } from '@/lib/domain/recipe-image-generation';
import 'server-only';
import { logger } from '@/lib/logger';
import {
  assertProfileAiEnabled,
  AiAccessDeniedError,
  aiUserIdForProfile,
  canAccountUseAi,
  getEffectiveAiPolicy,
} from './ai-access-service';

import {
  aiRecipeImageSchema,
  aiRecipeResponseContent,
  type AiRecipeImage,
} from '@/lib/domain/ai-bulk-import';
import { taskExecutionMode } from './task-settings-service';
import { AI_GROUNDING_INSTRUCTIONS } from '@/lib/domain/ai-grounding';

import { createHash, randomUUID } from 'node:crypto';

import { and, asc, desc, eq, inArray, lt, lte, isNull, or } from 'drizzle-orm';
import OpenAI, { toFile } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import {
  aiActionProposals,
  aiChatMessages,
  aiChatThreads,
  aiJobItems,
  aiJobs,
  aiOperationAudits,
  recipeImageCandidates,
  user,
} from '@/lib/db/schema';
import { aiStructuredRecipeSchema } from '@/lib/domain/ai';
import type { AiReasoningEffort } from '@/lib/domain/ai-assistant';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { recipeImagePrompt, type AiImageGenerationInput } from '@/lib/providers/ai-provider';
import { getAiAssistantProvider } from '@/lib/providers/ai-assistant-provider';
import { getOpenAiApiKey } from '@/lib/providers/openai-key';
import { getAiProvider } from '@/lib/services/ai-readiness-service';
import { getAiWorkloadSetting, getAiDataPolicy } from '@/lib/services/ai-settings-service';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { removeRecipeImage, storeRecipeImage } from '@/lib/storage/recipe-image-storage';

const LEASE_MS = 15 * 60 * 1_000;
const POLL_MS = Math.max(5_000, Number(process.env.AI_WORKER_POLL_SECONDS ?? '10') * 1_000);
const DIRECT_CONCURRENCY = Math.min(
  4,
  Math.max(1, Number(process.env.AI_WORKER_CONCURRENCY ?? '2')),
);
export const AI_BATCH_MIN_ITEMS = Math.min(
  50,
  Math.max(2, Number(process.env.AI_BATCH_MIN_ITEMS ?? '2')),
);

type AiJobRow = typeof aiJobs.$inferSelect;
type AiJobItemRow = typeof aiJobItems.$inferSelect;
import { UNKNOWN_AI_OUTCOMES as UNKNOWN_OUTCOMES } from '../../../shared/mobile-domain/ai-job-outcome';

type RecipeImageJobInput = AiImageGenerationInput & { recipeId: string; expectedRevision?: number };
type RecipeGenerationJobInput = {
  personalInstructions?: string;
  promptGuidance?: string;
  promptVersion?: string;
  maxOutputTokens?: number;
  requestTimeoutSeconds?: number;
  images?: AiRecipeImage[];
  label?: string;
  instructions: string;
  context: unknown;
  safetyIdentifier: string;
  reasoningEffort: AiReasoningEffort | null;
};

type BatchSnapshot = {
  id: string;
  status:
    | 'validating'
    | 'failed'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'expired'
    | 'cancelling'
    | 'cancelled';
  inputFileId?: string | null;
  outputFileId?: string | null;
  errorFileId?: string | null;
};

export type AiBatchClient = {
  submit(input: {
    endpoint: '/v1/images/generations' | '/v1/responses';
    lines: string;
    metadata: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
    assertAuthorized: () => void;
  }): Promise<{ batchId: string; inputFileId: string }>;
  retrieve(batchId: string): Promise<BatchSnapshot>;
  read(fileId: string): Promise<string>;
  cancel(batchId: string): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
};

export class AiJobNotFoundError extends Error {}
export class AiJobForbiddenError extends Error {}
export class AiJobStateError extends Error {}

const imageItemSchema = z
  .object({
    recipeId: z.string().uuid(),
    expectedRevision: z.number().int().positive().optional(),
    recipeTitle: z.string().trim().min(1).max(160),
    recipeSummary: z.string().max(800),
    ingredientNames: z.array(z.string().max(160)).max(80),
    servings: z.string().max(120).optional(),
    ingredients: z
      .array(
        z.object({
          quantity: z.number().nullable(),
          unit: z.string().max(40),
          item: z.string().max(160),
          note: z.string().max(160),
        }),
      )
      .max(80)
      .optional(),
    instructionSteps: z.array(z.string().max(600)).max(40).optional(),
  })
  .strict();

const imageOptionsSchema = z.object({
  personalInstructions: z.string().max(2000).default(''),
  imageQuality: z.enum(['low', 'medium', 'high']).default('low'),
  imageSize: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024'),
  promptGuidance: z.string().max(12000).optional(),
  promptVersion: z.string().optional(),
  requestTimeoutSeconds: z.number().optional(),
});
function savedImageOptions(job: AiJobRow) {
  return imageOptionsSchema.parse(parseJson(job.payload));
}

const recipeItemSchema = z
  .object({
    personalInstructions: z.string().max(2000).default(''),
    images: z.array(aiRecipeImageSchema).max(4).optional(),
    label: z.string().max(2048).optional(),
    promptGuidance: z.string().max(12000).optional(),
    promptVersion: z.string().max(160).optional(),
    maxOutputTokens: z.number().int().min(512).max(16384).optional(),
    requestTimeoutSeconds: z.number().int().min(15).max(300).optional(),
    instructions: z.string().min(1).max(12_000),
    context: z.unknown(),
    safetyIdentifier: z.string().min(1).max(160),
    reasoningEffort: z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']).nullable(),
  })
  .strict();

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('The queued AI job data is invalid.');
  }
}

function jobOwnerUserId(job: AiJobRow) {
  const payload = parseJson(job.payload) as { ownerUserId?: string; userId?: string };
  return job.kind === 'meal_plan_generation' ? payload.userId : payload.ownerUserId;
}

function assertJobAiAccess(job: AiJobRow) {
  const owner = jobOwnerUserId(job);
  if (
    owner
      ? !canAccountUseAi(owner) || aiUserIdForProfile(job.profileId) !== owner
      : process.env.NODE_ENV !== 'test'
  ) {
    throw new AiAccessDeniedError('The original account can no longer run this AI task.');
  }
  assertProfileAiEnabled(job.profileId);
}

/** Recheck the categories actually present in a saved household snapshot before transmitting it. */
function assertQueuedRecipeContextSharing(job: AiJobRow, context: unknown) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const populated = (value: unknown) => Array.isArray(value) && value.length > 0;
  const household = object(object(context).household);
  if (!Object.keys(household).length) return;
  const current = getAiDataPolicy(job.profileId);
  const shared = object(household.sharedCategories);
  const cookingPreferences = object(household.cookingPreferences);
  const legacyPreferences = object(household.equipment).personalCookingPreferences;
  if (cookingPreferences.status === 'available' || legacyPreferences != null) {
    if (!current.shareRecipePreferences)
      throw new AiJobForbiddenError('Cooking preference sharing changed. Prepare a new draft.');
    const profile = getDatabase()
      .select()
      .from(householdProfilesTable)
      .where(eq(householdProfilesTable.id, job.profileId))
      .get();
    const stored = profile?.goalContext.cookingPreferences ?? null;
    if (
      !profile ||
      profile.archivedAt ||
      (cookingPreferences.status === 'available' && cookingPreferences.revision !== digest(stored))
    )
      throw new AiJobForbiddenError(
        'Cooking preferences changed after queueing. Prepare a refreshed review.',
      );
    if (legacyPreferences != null && digest(legacyPreferences) !== digest(stored))
      throw new AiJobForbiddenError(
        'Legacy cooking preference context requires a refreshed review.',
      );
  }

  if (object(household.equipment).status === 'available') {
    if (!current.shareKitchenEquipment)
      throw new AiJobForbiddenError('Equipment sharing changed. Prepare a new draft.');
    const equipment = object(household.equipment);
    if (equipment.personalCookingPreferences != null && !current.shareRecipePreferences)
      throw new AiJobForbiddenError('Cooking preference sharing changed. Prepare a new draft.');
    const kitchen =
      typeof equipment.kitchenId === 'string'
        ? getDatabase().select().from(kitchens).where(eq(kitchens.id, equipment.kitchenId)).get()
        : null;
    if (!kitchen || kitchen.revision !== equipment.revision)
      throw new AiJobForbiddenError('Kitchen changed after queueing. Prepare a refreshed review.');
  }
  const require = (allowed: boolean) => {
    if (!allowed)
      throw new AiJobForbiddenError(
        'Sharing or household access changed after this draft was queued. Prepare a new draft with current permissions.',
      );
  };
  if (shared.pantry === true || populated(household.pantry)) require(current.sharePantry);
  if (
    shared.shoppingLists === true ||
    populated(household.shoppingLists) ||
    populated(household.supermarkets) ||
    object(household.preferences).shopping != null
  )
    require(current.shareShoppingLists);
  if (shared.recipes === true || populated(household.recipes)) {
    require(current.shareSharedRecipes);
    if (
      Array.isArray(household.recipes) &&
      household.recipes.some((recipe) => object(recipe).personalRating != null)
    )
      require(current.shareRecipePreferences);
  }
  if (shared.mealPlans === true || populated(household.mealPlan)) {
    require(current.shareMealPlans);
    if (
      Array.isArray(household.mealPlan) &&
      household.mealPlan.some(
        (meal) =>
          object(meal).recipeOverride != null ||
          (typeof object(meal).recipeIngredientsSnapshot === 'string' &&
            object(meal).recipeIngredientsSnapshot !== '{"baseServings":"","ingredients":[]}'),
      )
    )
      require(current.shareSharedRecipes);
  }
  const profiles = Array.isArray(household.profiles) ? household.profiles : [];
  const preferences = object(household.preferences).profiles;
  const allProfileKeys = [...profiles, ...(Array.isArray(preferences) ? preferences : [])].map(
    (profile) => object(profile).key,
  );
  if (allProfileKeys.some((id) => typeof id === 'string' && id !== job.profileId)) {
    const owner = jobOwnerUserId(job);
    const account = owner
      ? getDatabase().select({ role: user.role }).from(user).where(eq(user.id, owner)).get()
      : null;
    require(Boolean(account && appRoleCan(account.role, 'shared.update')));
  }
  const fields = {
    shareIdentity: ['displayName'],
    shareProfileGoals: ['profileGoals'],
    shareDietaryPreferences: [
      'kitchenInterview',
      'dietaryPreferences',
      'foodAllergies',
      'dietaryExclusions',
    ],
    sharePersonalMetrics: [
      'activityLevel',
      'ageYears',
      'enteredBodyMetrics',
      'heightCentimeters',
      'referenceSexCategory',
      'explicitlyEnteredLifeStage',
    ],
    shareWeight: ['currentWeightKilograms', 'targetWeightKilograms', 'weightTargetDate'],
    shareNutritionGoals: ['nutritionGoalType', 'weightGoalPace', 'nutritionGoals'],
    shareNutritionAggregates: ['nutrition'],
    shareRawDiary: ['diary'],
  } as const;
  for (const raw of profiles) {
    const profile = object(raw);
    if (typeof profile.key !== 'string')
      throw new AiJobForbiddenError('The queued profile context needs a fresh review.');
    const policy = getAiDataPolicy(profile.key);
    for (const [key, names] of Object.entries(fields))
      if (names.some((name) => Object.hasOwn(profile, name)))
        require(policy[key as keyof typeof fields]);
    const measurement = object(profile.latestRecordedMeasurement);
    if (measurement.weightKilograms != null) require(policy.shareWeight);
    if (measurement.bodyMetrics != null) require(policy.sharePersonalMetrics);
    if (
      [profile.enteredBodyMetrics, measurement.bodyMetrics].some((metrics) =>
        Object.entries(object(metrics)).some(
          ([name, value]) => name.endsWith('Kilograms') && value != null,
        ),
      )
    )
      require(policy.shareWeight);
  }
}

function titleFor(job: AiJobRow): string {
  return job.kind === 'meal_plan_generation'
    ? 'Scheduled meal-plan draft'
    : job.kind === 'recipe_images'
      ? 'Recipe images'
      : 'Recipe set';
}

function itemCounts(items: AiJobItemRow[]) {
  return {
    totalItems: items.length,
    completedItems: items.filter((item) => item.status === 'succeeded').length,
    failedItems: items.filter((item) => item.status === 'failed').length,
  };
}

function publicJob(job: AiJobRow, items: AiJobItemRow[]) {
  const counts = itemCounts(items);
  const candidateIds = new Set(
    job.kind === 'recipe_images' && items.length
      ? getDatabase()
          .select({ id: recipeImageCandidates.id })
          .from(recipeImageCandidates)
          .where(
            inArray(
              recipeImageCandidates.id,
              items.map((item) => item.id),
            ),
          )
          .all()
          .map((row) => row.id)
      : [],
  );
  return {
    id: job.id,
    kind: job.kind,
    title: titleFor(job),
    status: job.status,
    executionMode: job.executionMode,
    model: job.model,
    actionId: job.actionId,
    threadId: job.threadId,
    errorCode: job.errorCode,
    ...counts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    items: items.map((item) => {
      const payload = parseJson(item.payload) as { recipeTitle?: string; label?: string };
      return {
        id: item.id,
        recipeId: item.recipeId,
        label: payload.recipeTitle ?? payload.label ?? `Recipe ${item.position + 1}`,
        status: item.status,
        errorCode: item.errorCode,
        candidateId: candidateIds.has(item.id) ? item.id : null,
      };
    }),
  };
}

function jobWithItems(jobId: string, profileId?: string) {
  ensureDatabase();
  const job = getDatabase().select().from(aiJobs).where(eq(aiJobs.id, jobId)).get();
  if (!job) throw new AiJobNotFoundError('That background AI task no longer exists.');
  if (profileId && job.profileId !== profileId) {
    throw new AiJobForbiddenError('That background AI task belongs to another profile.');
  }
  const items = getDatabase()
    .select()
    .from(aiJobItems)
    .where(eq(aiJobItems.jobId, job.id))
    .orderBy(asc(aiJobItems.position))
    .all();
  return { job, items };
}

export function getAiJob(jobId: string, profileId: string, userId?: string) {
  const { job, items } = jobWithItems(jobId, profileId);
  if (userId && jobOwnerUserId(job) !== userId)
    throw new AiJobForbiddenError('That background task belongs to another account.');
  return publicJob(job, items);
}

export function listAiJobs(input: {
  profileId: string;
  userId?: string;
  threadId?: string | null;
  limit?: number;
}) {
  ensureDatabase();
  const rows = getDatabase()
    .select()
    .from(aiJobs)
    .where(
      input.threadId
        ? and(eq(aiJobs.profileId, input.profileId), eq(aiJobs.threadId, input.threadId))
        : eq(aiJobs.profileId, input.profileId),
    )
    .orderBy(desc(aiJobs.createdAt))
    .limit(Math.min(100, Math.max(1, input.limit ?? 25)))
    .all()
    .reverse();
  return rows
    .filter((job) => !input.userId || jobOwnerUserId(job) === input.userId)
    .map((job) => {
      const items = getDatabase()
        .select()
        .from(aiJobItems)
        .where(eq(aiJobItems.jobId, job.id))
        .all();
      return publicJob(job, items);
    });
}

function insertImageAudit(input: {
  id: string;
  profileId: string;
  threadId: string | null;
  actionId: string | null;
  model: string;
  promptVersion?: string;
  image: RecipeImageJobInput;
  now: Date;
}) {
  getDatabase()
    .insert(aiOperationAudits)
    .values({
      id: input.id,
      kind: 'image-generation',
      status: 'requested',
      sourceDigest: digest(input.image),
      sourceLabel: input.image.recipeTitle.slice(0, 160),
      provider: 'OpenAI',
      model: input.model,
      promptVersion: input.promptVersion ?? null,
      reasoningEffort: null,
      inputTokens: null,
      outputTokens: null,
      threadId: input.threadId,
      actionId: input.actionId,
      summaryId: null,
      errorCode: null,
      profileId: input.profileId,
      recipeId: input.image.recipeId,
      importId: null,
      generatedImageId: null,
      createdAt: input.now,
      completedAt: null,
    })
    .run();
}

export function enqueueRecipeImageJob(input: {
  profileId: string;
  threadId?: string | null;
  actionId?: string | null;
  images: RecipeImageJobInput[];
  approvedOptions?: ReturnType<typeof savedImageOptions> & { model: string };
}) {
  ensureDatabase();
  assertAiExecutionActive();
  if (!input.images.length) return null;
  const now = new Date();
  if (input.approvedOptions)
    resolveAiExecutionOptions(input.profileId, 'image_generation', input.approvedOptions);
  // Validate against current policy, but persist raw approved guidance. The resolver
  // composes personal guidance for transmission; saving that would append it twice.
  const setting = {
    ...getAiWorkloadSetting(input.profileId, 'image_generation'),
    ...input.approvedOptions,
  };
  const promptVersion =
    input.approvedOptions?.promptVersion ??
    `${RECIPE_IMAGE_PROMPT_VERSION}:${setting.promptVersion ?? 'default'}`;
  if (!setting.enabled)
    throw new AiJobForbiddenError('Image generation is disabled for this account.');
  if (!getAiDataPolicy(input.profileId).shareSharedRecipes)
    throw new AiJobForbiddenError('Recipe sharing is disabled for this account.');
  const ownerUserId =
    aiUserIdForProfile(input.profileId) ??
    (process.env.NODE_ENV === 'test' ? `profile:${input.profileId}` : null);
  if (!ownerUserId) throw new AiJobForbiddenError('A signed-in account must own image requests.');
  const images = input.images.map((image) => {
    const saved = getRecipe(image.recipeId, input.profileId);
    if (!saved || (image.expectedRevision && saved.currentRevision !== image.expectedRevision))
      throw new AiJobStateError(
        'The recipe changed. Review its current version before requesting an image.',
      );
    return {
      ...recipeImageInput(saved),
      recipeId: saved.id,
      expectedRevision: saved.currentRevision,
    };
  });
  const id = randomUUID();
  const mode = taskExecutionMode(input.profileId, input.images.length);
  getDatabase().transaction(() => {
    getDatabase()
      .insert(aiJobs)
      .values({
        id,
        profileId: input.profileId,
        threadId: input.threadId ?? null,
        actionId: input.actionId ?? null,
        turnId: currentAiExecutionContext()?.turnId ?? null,
        kind: 'recipe_images',
        status: 'queued',
        executionMode: mode,
        model: setting.model,
        payload: JSON.stringify({
          ownerUserId: aiUserIdForProfile(input.profileId),
          ...imageOptionsSchema.parse(setting),
          personalInstructions:
            input.approvedOptions?.personalInstructions ??
            getEffectiveAiPolicy(input.profileId).instructions,
          promptVersion,
        }),
        result: null,
        sourceDigest: digest(images),
        providerBatchId: null,
        providerInputFileId: null,
        attempts: 0,
        nextAttemptAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })
      .run();
    images.forEach((image, position) => {
      const itemId = randomUUID();
      const auditId = randomUUID();
      insertImageAudit({
        id: auditId,
        profileId: input.profileId,
        threadId: input.threadId ?? null,
        actionId: input.actionId ?? null,
        model: setting.model,
        promptVersion,
        image,
        now,
      });
      getDatabase()
        .insert(recipeImageCandidates)
        .values({
          id: itemId,
          recipeId: image.recipeId,
          sourceRevision: image.expectedRevision,
          ownerUserId,
          profileId: input.profileId,
          intentHash: digest(image),
          status: 'requested',
          model: setting.model,
          quality: setting.imageQuality ?? 'low',
          size: setting.imageSize ?? '1024x1024',
          promptVersion,
          auditId,
          createdAt: now,
        })
        .run();
      getDatabase()
        .insert(aiJobItems)
        .values({
          id: itemId,
          jobId: id,
          position,
          customId: `${id}:${position}`,
          status: 'pending',
          payload: JSON.stringify(image),
          result: null,
          errorCode: null,
          recipeId: image.recipeId,
          auditId,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        })
        .run();
    });
  });
  void wakeAiJobWorker();
  return getAiJob(id, input.profileId);
}

export function enqueueRecipeBatchGenerationJob(input: {
  profileId: string;
  threadId: string | null;
  model: string;
  recipes: RecipeGenerationJobInput[];
  generateRecipeImages: boolean;
}) {
  ensureDatabase();
  assertProfileAiEnabled(input.profileId);
  assertAiExecutionActive();
  if (!input.recipes.length || input.recipes.length > 50)
    throw new AiJobStateError('Choose 1 to 50 recipes for a background task.');
  const setting = getAiWorkloadSetting(input.profileId, 'recipe_generation');
  if (!setting.enabled) throw new AiJobForbiddenError('Recipe generation is disabled.');
  const now = new Date();
  const id = randomUUID();
  getDatabase().transaction(() => {
    getDatabase()
      .insert(aiJobs)
      .values({
        id,
        profileId: input.profileId,
        threadId: input.threadId,
        actionId: null,
        turnId: currentAiExecutionContext()?.turnId ?? null,
        kind: 'recipe_batch_generation',
        status: 'queued',
        executionMode: taskExecutionMode(input.profileId, input.recipes.length),
        model: input.model,
        payload: JSON.stringify({
          generateRecipeImages: false,
          ownerUserId: aiUserIdForProfile(input.profileId),
        }),
        result: null,
        sourceDigest: digest(input.recipes),
        providerBatchId: null,
        providerInputFileId: null,
        attempts: 0,
        nextAttemptAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })
      .run();
    input.recipes.forEach((submitted, position) => {
      const recipe = {
        ...submitted,
        personalInstructions:
          submitted.personalInstructions ?? getEffectiveAiPolicy(input.profileId).instructions,
        promptGuidance: submitted.promptGuidance ?? setting.promptGuidance,
        promptVersion: submitted.promptVersion ?? setting.promptVersion,
        maxOutputTokens: Math.min(
          submitted.maxOutputTokens ?? Infinity,
          setting.maxOutputTokens ?? 4096,
        ),
        requestTimeoutSeconds: Math.min(
          submitted.requestTimeoutSeconds ?? Infinity,
          setting.requestTimeoutSeconds ?? 180,
        ),
      };
      const auditId = randomUUID();
      getDatabase()
        .insert(aiOperationAudits)
        .values({
          id: auditId,
          kind: 'recipe-generation',
          status: 'requested',
          sourceDigest: digest(recipe.context),
          sourceLabel: (recipe.label ?? `Queued recipe ${position + 1}`).slice(0, 160),
          provider: 'OpenAI',
          model: input.model,
          reasoningEffort: recipe.reasoningEffort,
          promptVersion: recipe.promptVersion,
          inputTokens: null,
          outputTokens: null,
          threadId: input.threadId,
          actionId: null,
          summaryId: null,
          errorCode: null,
          profileId: input.profileId,
          recipeId: null,
          importId: null,
          generatedImageId: null,
          createdAt: now,
          completedAt: null,
        })
        .run();
      getDatabase()
        .insert(aiJobItems)
        .values({
          id: randomUUID(),
          jobId: id,
          position,
          customId: `${id}:${position}`,
          status: 'pending',
          payload: JSON.stringify(recipe),
          result: null,
          errorCode: null,
          recipeId: null,
          auditId,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        })
        .run();
    });
  });
  void wakeAiJobWorker();
  return getAiJob(id, input.profileId);
}

class AiBatchNotSubmittedError extends Error {}

export class OpenAiBatchClient implements AiBatchClient {
  private readonly client: Pick<OpenAI, 'files' | 'batches'>;

  constructor(apiKey: string, client?: Pick<OpenAI, 'files' | 'batches'>) {
    this.client = client ?? new OpenAI({ apiKey, maxRetries: 0, timeout: 120_000 });
  }

  async submit(input: Parameters<AiBatchClient['submit']>[0]) {
    let uploadedFileId: string | undefined;
    let paidSubmissionStarted = false;
    try {
      const upload = await toFile(Buffer.from(input.lines, 'utf8'), 'bord-ai-batch.jsonl', {
        type: 'application/jsonl',
      });
      input.signal?.throwIfAborted();
      input.assertAuthorized();
      const file = await this.client.files.create(
        { file: upload, purpose: 'batch' },
        { signal: input.signal, timeout: input.timeout, maxRetries: 0 },
      );
      uploadedFileId = file.id;
      // Upload can outlive authorization. Revalidate before initiating paid work.
      input.signal?.throwIfAborted();
      input.assertAuthorized();
      paidSubmissionStarted = true;
      const batch = await this.client.batches.create(
        {
          input_file_id: file.id,
          endpoint: input.endpoint,
          completion_window: '24h',
          metadata: input.metadata,
        },
        { signal: input.signal, timeout: input.timeout, maxRetries: 0 },
      );
      return { batchId: batch.id, inputFileId: file.id };
    } catch (error) {
      if (paidSubmissionStarted) throw error;
      if (uploadedFileId)
        await this.client.files
          .delete(uploadedFileId, {
            timeout: Math.min(input.timeout ?? 15000, 15000),
            maxRetries: 0,
          })
          .catch(() => undefined);
      throw new AiBatchNotSubmittedError(
        'The paid batch submission was not started. Review current permissions and settings before trying again.',
        { cause: error },
      );
    }
  }

  async retrieve(batchId: string): Promise<BatchSnapshot> {
    const batch = await this.client.batches.retrieve(batchId);
    return {
      id: batch.id,
      status: batch.status,
      inputFileId: batch.input_file_id,
      outputFileId: batch.output_file_id,
      errorFileId: batch.error_file_id,
    };
  }

  async read(fileId: string) {
    return (await this.client.files.content(fileId)).text();
  }

  async cancel(batchId: string) {
    await this.client.batches.cancel(batchId);
  }

  async deleteFile(fileId: string) {
    await this.client.files.delete(fileId);
  }
}

let batchClientForTests: AiBatchClient | null = null;

export function setAiBatchClientForTests(client: AiBatchClient | null): void {
  batchClientForTests = client;
}

function getAiBatchClient(): AiBatchClient {
  if (batchClientForTests) return batchClientForTests;
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error('OpenAI is not configured.');
  return new OpenAiBatchClient(apiKey);
}

function responseBodyText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
  }
  return null;
}

function responseImageBytes(body: unknown): Buffer {
  if (!body || typeof body !== 'object') throw new Error('OpenAI did not return an image.');
  const data = (body as { data?: unknown }).data;
  const encoded = Array.isArray(data)
    ? (data[0] as { b64_json?: unknown } | undefined)?.b64_json
    : null;
  if (typeof encoded !== 'string') throw new Error('OpenAI did not return an image.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) {
    throw new Error('OpenAI returned an unsafe image.');
  }
  return bytes;
}

function batchLines(job: AiJobRow, items: AiJobItemRow[]) {
  return items
    .filter((item) => item.status === 'pending')
    .map((item) => {
      if (job.kind === 'recipe_images') {
        const image = imageItemSchema.parse(parseJson(item.payload));
        if (
          !image.expectedRevision ||
          getRecipe(image.recipeId, job.profileId)?.currentRevision !== image.expectedRevision
        )
          throw new AiJobStateError(
            'Review the current recipe before submitting this image request.',
          );
        const options = resolveAiExecutionOptions(job.profileId, 'image_generation', {
          model: job.model,
          ...savedImageOptions(job),
        });
        return JSON.stringify({
          custom_id: item.customId,
          method: 'POST',
          url: '/v1/images/generations',
          body: {
            model: job.model,
            prompt: recipeImagePrompt(image, options.promptGuidance),
            size: options.imageSize,
            quality: options.imageQuality,
            output_format: 'webp',
          },
        });
      }
      const recipe = recipeItemSchema.parse(parseJson(item.payload));
      assertQueuedRecipeContextSharing(job, recipe.context);
      const options = resolveAiExecutionOptions(job.profileId, 'recipe_generation', {
        ...recipe,
        model: job.model,
      });
      return JSON.stringify({
        custom_id: item.customId,
        method: 'POST',
        url: '/v1/responses',
        body: {
          model: job.model,
          instructions: [
            AI_GROUNDING_INSTRUCTIONS,
            recipe.instructions,
            options.promptGuidance ?? '',
          ].join('\n'),
          max_output_tokens: options.maxOutputTokens,
          input: [
            {
              role: 'user',
              content: aiRecipeResponseContent(recipe.context, recipe.images),
            },
          ],
          text: { format: zodTextFormat(aiStructuredRecipeSchema, 'generated_recipe') },
          store: false,
          safety_identifier: recipe.safetyIdentifier,
          ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
        },
      });
    })
    .join('\n');
}

function endpointFor(job: AiJobRow): '/v1/images/generations' | '/v1/responses' {
  return job.kind === 'recipe_images' ? '/v1/images/generations' : '/v1/responses';
}

function ownsActiveLease(job: AiJobRow) {
  const current = getDatabase()
    .select({ status: aiJobs.status, leaseToken: aiJobs.leaseToken })
    .from(aiJobs)
    .where(eq(aiJobs.id, job.id))
    .get();
  return (
    !!current &&
    ['running', 'submitted'].includes(current.status) &&
    current.leaseToken === job.leaseToken
  );
}

function updateItemSuccess(item: AiJobItemRow, result: unknown) {
  const now = new Date();
  getDatabase()
    .update(aiJobItems)
    .set({
      status: 'succeeded',
      result: JSON.stringify(result),
      errorCode: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(aiJobItems.id, item.id))
    .run();
  if (item.auditId) {
    getDatabase()
      .update(aiOperationAudits)
      .set({ status: 'succeeded', errorCode: null, completedAt: now })
      .where(eq(aiOperationAudits.id, item.auditId))
      .run();
  }
}

function updateItemFailure(item: AiJobItemRow, errorCode: string) {
  const now = new Date();
  const uncertain = UNKNOWN_OUTCOMES.includes(errorCode);
  getDatabase().transaction(() => {
    // Candidate state follows the acknowledged provider outcome. A terminal failure
    // must not look like work is still pending, and a discard is never resurrected.
    getDatabase()
      .update(recipeImageCandidates)
      .set({ status: uncertain ? 'outcome_unknown' : 'failed' })
      .where(
        and(eq(recipeImageCandidates.id, item.id), eq(recipeImageCandidates.status, 'requested')),
      )
      .run();
    getDatabase()
      .update(aiJobItems)
      .set({ status: 'failed', errorCode, updatedAt: now, completedAt: now })
      .where(eq(aiJobItems.id, item.id))
      .run();
    if (item.auditId) {
      getDatabase()
        .update(aiOperationAudits)
        .set({
          status: uncertain
            ? 'outcome_unknown'
            : errorCode === 'cancelled'
              ? 'cancelled'
              : 'failed',
          errorCode,
          completedAt: now,
        })
        .where(eq(aiOperationAudits.id, item.auditId))
        .run();
    }
  });
}

async function attachRecipeImage(
  item: AiJobItemRow,
  image: RecipeImageJobInput,
  bytes: Buffer,
  job: AiJobRow,
  altText = `AI-generated serving image for ${image.recipeTitle}`.slice(0, 180),
) {
  if (!ownsActiveLease(job)) return;
  const candidate = getDatabase()
    .select()
    .from(recipeImageCandidates)
    .where(eq(recipeImageCandidates.id, item.id))
    .get();
  if (!candidate || !image.expectedRevision)
    throw new AiJobStateError(
      'Legacy image request has no reviewed revision. Request a new image review.',
    );
  if (candidate.status !== 'requested') return;
  const stored = await storeRecipeImage(item.id, bytes);
  if (!ownsActiveLease(job)) {
    await removeRecipeImage(stored.storageKey);
    return;
  }
  const updated = getDatabase().transaction(() => {
    if (!ownsActiveLease(job)) return false;
    const result = getDatabase()
      .update(recipeImageCandidates)
      .set({ status: 'ready', ...stored, altText })
      .where(
        and(eq(recipeImageCandidates.id, item.id), eq(recipeImageCandidates.status, 'requested')),
      )
      .run();
    if (result.changes !== 1) return false;
    updateItemSuccess(item, {
      recipeId: image.recipeId,
      candidateId: item.id,
      sourceRevision: image.expectedRevision,
    });
    return true;
  });
  if (!updated) {
    await removeRecipeImage(stored.storageKey);
  }
}

async function processDirectImage(item: AiJobItemRow, job: AiJobRow) {
  let providerStarted = false;
  let providerCompleted = false;
  try {
    assertJobAiAccess(job);
    if (
      !getAiWorkloadSetting(job.profileId, 'image_generation').enabled ||
      !getAiDataPolicy(job.profileId).shareSharedRecipes
    )
      throw new AiJobForbiddenError('AI is disabled.');
    const image = imageItemSchema.parse(parseJson(item.payload));
    if (!image.expectedRevision)
      throw new AiJobStateError('Legacy image request needs a fresh reviewed revision.');
    if (getRecipe(image.recipeId, job.profileId)?.currentRevision !== image.expectedRevision)
      throw new AiJobStateError('The reviewed recipe changed before generation.');
    const generated = await withAiExecutionContext({ parentJobId: job.id }, () =>
      executeAiWorkload(
        job.profileId,
        'image_generation',
        async (options) => {
          providerStarted = true;
          const result = await getAiProvider().generateRecipeImage(image, options);
          providerCompleted = true;
          return result;
        },
        { model: job.model, ...savedImageOptions(job) },
      ),
    );
    await attachRecipeImage(item, image, generated.bytes, job, generated.altText);
  } catch (error) {
    if (ownsActiveLease(job)) {
      const knownFailure =
        error instanceof Error &&
        'generationOutcome' in error &&
        error.generationOutcome === 'failed';
      updateItemFailure(
        item,
        providerStarted && !providerCompleted && !knownFailure
          ? 'image_generation_outcome_unknown'
          : 'image_generation_failed',
      );
    }
  }
}

async function processDirectRecipe(item: AiJobItemRow, job: AiJobRow) {
  try {
    assertJobAiAccess(job);
    if (!getAiWorkloadSetting(job.profileId, 'recipe_generation').enabled)
      throw new AiJobForbiddenError('AI is disabled.');
    const request = recipeItemSchema.parse(parseJson(item.payload));
    assertQueuedRecipeContextSharing(job, request.context);
    const recipe = recipeInputSchema.parse(
      await withAiExecutionContext({ parentJobId: job.id }, () =>
        executeAiWorkload(
          job.profileId,
          'recipe_generation',
          (options) =>
            getAiAssistantProvider().generateRecipe({
              ...request,
              ...options,
              safetyIdentifier: request.safetyIdentifier,
              instructions: [AI_GROUNDING_INSTRUCTIONS, request.instructions].join('\n'),
              context: request.context,
              images: request.images,
            }),
          { ...request, model: job.model },
        ),
      ),
    );
    if (ownsActiveLease(job)) updateItemSuccess(item, recipe);
  } catch {
    if (ownsActiveLease(job)) updateItemFailure(item, 'recipe_generation_failed');
  }
}

async function finishRecipeProposal(job: AiJobRow) {
  const items = jobWithItems(job.id).items;
  const recipes = items.flatMap((item) => {
    if (item.status !== 'succeeded' || !item.result) return [];
    try {
      return [recipeInputSchema.parse(parseJson(item.result))];
    } catch {
      return [];
    }
  });
  if (!recipes.length) return null;
  const generateRecipeImages = z
    .object({ generateRecipeImages: z.boolean().default(false) })
    .parse(parseJson(job.payload)).generateRecipeImages;
  const { createAiActionProposal } = await import('@/lib/services/ai-action-service');
  if (!ownsActiveLease(job)) return null;
  const proposal = createAiActionProposal({
    threadId: job.threadId,
    profileId: job.profileId,
    kind: 'recipe_batch_create',
    payload: { recipes, generateRecipeImages },
    preview: { operation: 'create recipe batch', recipes, model: job.model, generateRecipeImages },
  });
  if (job.threadId) {
    const now = new Date();
    getDatabase()
      .insert(aiChatMessages)
      .values({
        id: randomUUID(),
        threadId: job.threadId,
        role: 'assistant',
        content:
          recipes.length === items.length
            ? 'Your recipe set is ready to review.'
            : `${recipes.length} of ${items.length} recipes are ready to review.`,
        model: job.model,
        actionId: proposal.id,
        createdAt: now,
      })
      .run();
    getDatabase()
      .update(aiChatThreads)
      .set({ updatedAt: now })
      .where(eq(aiChatThreads.id, job.threadId))
      .run();
  }
  return proposal;
}

async function finishJob(job: AiJobRow) {
  const state = jobWithItems(job.id);
  if (!ownsActiveLease(job)) return;
  const latest = state.items;
  const counts = itemCounts(latest);
  const unknownOutcome = latest.find((item) =>
    UNKNOWN_OUTCOMES.includes(item.errorCode ?? ''),
  )?.errorCode;
  const proposal = job.kind === 'recipe_batch_generation' ? await finishRecipeProposal(job) : null;
  const now = new Date();
  const finished = getDatabase()
    .update(aiJobs)
    .set({
      status: counts.failedItems || !counts.completedItems ? 'failed' : 'completed',
      actionId: proposal?.id ?? job.actionId,
      result: JSON.stringify({ ...counts, actionId: proposal?.id ?? job.actionId }),
      errorCode: unknownOutcome ?? (counts.failedItems ? 'partial_failure' : null),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(
      and(
        eq(aiJobs.id, job.id),
        eq(aiJobs.leaseToken, job.leaseToken!),
        inArray(aiJobs.status, ['running', 'submitted']),
      ),
    )
    .run();
  if (!finished.changes && proposal)
    getDatabase()
      .update(aiActionProposals)
      .set({ status: 'cancelled', decidedAt: now })
      .where(and(eq(aiActionProposals.id, proposal.id), eq(aiActionProposals.status, 'pending')))
      .run();
  if (finished.changes && job.threadId && job.kind === 'recipe_images') {
    const failedNames = latest
      .filter((item) => item.status === 'failed')
      .map((item) => (parseJson(item.payload) as { recipeTitle: string }).recipeTitle);
    getDatabase()
      .insert(aiChatMessages)
      .values({
        id: randomUUID(),
        threadId: job.threadId,
        role: 'assistant',
        model: job.model,
        content: `${counts.completedItems} of ${counts.totalItems} image previews prepared.${failedNames.length ? ` No preview available for: ${failedNames.join(', ')}. ${unknownOutcome ? 'The provider outcome is unknown; reconcile this original operation before starting more paid work.' : 'Review the task details and retry only the unfinished items; retrying may incur charges.'}` : ' Review each image before selecting it for the matching recipe.'}`,
        createdAt: now,
      })
      .run();
    getDatabase()
      .update(aiChatThreads)
      .set({ updatedAt: now })
      .where(eq(aiChatThreads.id, job.threadId))
      .run();
  }
}

async function runDirectJob(job: AiJobRow, items: AiJobItemRow[]) {
  const pending = items.filter((item) => item.status === 'pending');
  for (let index = 0; index < pending.length; index += DIRECT_CONCURRENCY) {
    if (!ownsActiveLease(job)) return;
    const group = pending.slice(index, index + DIRECT_CONCURRENCY);
    await Promise.all(
      group.map((item) =>
        job.kind === 'recipe_images'
          ? processDirectImage(item, job)
          : processDirectRecipe(item, job),
      ),
    );
  }
  await finishJob(job);
}

async function submitBatchJob(job: AiJobRow, items: AiJobItemRow[]) {
  const lines = batchLines(job, items);
  if (!lines) return finishJob(job);
  const approvedPolicy = getEffectiveAiPolicy(job.profileId);
  const assertAuthorized = () => {
    assertAiExecutionActive();
    if (!ownsActiveLease(job))
      throw new AiJobStateError('This task no longer owns its execution lease.');
    assertJobAiAccess(job);
    const current = jobWithItems(job.id);
    if (
      current.job.model !== job.model ||
      current.job.payload !== job.payload ||
      current.items.length !== items.length ||
      current.items.some(
        (item, index) =>
          item.id !== items[index]?.id ||
          item.payload !== items[index]?.payload ||
          item.status !== items[index]?.status,
      )
    )
      throw new AiJobStateError('The reviewed batch changed before submission.');
    if (job.kind === 'recipe_images' && !getAiDataPolicy(job.profileId).shareSharedRecipes)
      throw new AiJobForbiddenError('Recipe sharing is disabled for this account.');
    const currentPolicy = getEffectiveAiPolicy(job.profileId);
    if (
      currentPolicy.requestTimeoutSeconds < approvedPolicy.requestTimeoutSeconds ||
      currentPolicy.generationsPerTenMinutes < approvedPolicy.generationsPerTenMinutes ||
      batchLines(job, items) !== lines
    )
      throw new AiJobStateError(
        'AI limits or reviewed options changed. Prepare a new batch before submission.',
      );
  };
  const submitted = await withAiExecutionContext(
    {
      parentJobId: job.id,
      requestUnits: items.filter((item) => item.status === 'pending').length,
      submittedConfigurations: lines.split('\n').map((line) => {
        const submitted = JSON.parse(line);
        const body = submitted.body;
        const saved = parseJson(
          items.find((item) => item.customId === submitted.custom_id)!.payload,
        ) as { promptVersion?: string };
        return {
          model: body.model,
          promptVersion:
            saved.promptVersion ??
            (job.kind === 'recipe_images' ? savedImageOptions(job).promptVersion : undefined) ??
            'builtin',
          maxOutputTokens: body.max_output_tokens,
          imageQuality: body.quality,
          imageSize: body.size,
        };
      }),
    },
    () =>
      executeAiWorkload(
        job.profileId,
        job.kind === 'recipe_images' ? 'image_generation' : 'recipe_generation',
        async (options) => {
          assertAuthorized();
          getDatabase()
            .update(aiJobs)
            .set({ errorCode: 'provider_submission_pending' })
            .where(eq(aiJobs.id, job.id))
            .run();
          try {
            return await getAiBatchClient().submit({
              endpoint: endpointFor(job),
              lines,
              metadata: { bord_ai_job_id: job.id, bord_ai_job_kind: job.kind },
              signal: options.signal,
              timeout: options.requestTimeoutSeconds * 1000,
              assertAuthorized,
            });
          } catch (error) {
            if (error instanceof AiBatchNotSubmittedError)
              getDatabase()
                .update(aiJobs)
                .set({ errorCode: 'provider_submission_not_started' })
                .where(and(eq(aiJobs.id, job.id), eq(aiJobs.leaseToken, job.leaseToken!)))
                .run();
            throw error;
          }
        },
        { model: job.model, ...(job.kind === 'recipe_images' ? savedImageOptions(job) : {}) },
      ),
  );
  const now = new Date();
  const submittedState = getDatabase()
    .update(aiJobs)
    .set({
      status: 'submitted',
      errorCode: null,
      providerBatchId: submitted.batchId,
      providerInputFileId: submitted.inputFileId,
      nextAttemptAt: new Date(now.getTime() + POLL_MS),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiJobs.id, job.id),
        eq(aiJobs.status, 'running'),
        eq(aiJobs.leaseToken, job.leaseToken!),
      ),
    )
    .run();
  if (!submittedState.changes) {
    await getAiBatchClient()
      .cancel(submitted.batchId)
      .catch(() => undefined);
    await getAiBatchClient()
      .deleteFile(submitted.inputFileId)
      .catch(() => undefined);
  }
}

function jsonlRows(value: string): Array<Record<string, unknown>> {
  return value
    .split(/\r?\n/gu)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const row = JSON.parse(line);
        return row && typeof row === 'object' ? [row as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
}

async function materializeBatchItem(job: AiJobRow, item: AiJobItemRow, body: unknown) {
  if (job.kind === 'recipe_images') {
    const image = imageItemSchema.parse(parseJson(item.payload));
    await attachRecipeImage(item, image, responseImageBytes(body), job);
    return;
  }
  const text = responseBodyText(body);
  if (!text) throw new Error('OpenAI did not return a recipe.');
  const recipe = recipeInputSchema.parse(JSON.parse(text));
  updateItemSuccess(item, recipe);
}

async function reconcileCompletedBatch(
  job: AiJobRow,
  snapshot: BatchSnapshot,
  items: AiJobItemRow[],
) {
  const outputRows = snapshot.outputFileId
    ? jsonlRows(await getAiBatchClient().read(snapshot.outputFileId))
    : [];
  const errorRows = snapshot.errorFileId
    ? jsonlRows(await getAiBatchClient().read(snapshot.errorFileId))
    : [];
  const rows = new Map<string, Record<string, unknown>>(
    [...outputRows, ...errorRows].flatMap((row) =>
      typeof row.custom_id === 'string' ? [[row.custom_id, row] as const] : [],
    ),
  );
  for (const item of items.filter((candidate) => candidate.status === 'pending')) {
    if (!ownsActiveLease(job)) return;
    const row = rows.get(item.customId);
    const response = row?.response as { status_code?: unknown; body?: unknown } | undefined;
    try {
      if (Number(response?.status_code) !== 200) throw new Error('Batch item failed.');
      await materializeBatchItem(job, item, response?.body);
    } catch {
      if (ownsActiveLease(job)) updateItemFailure(item, 'batch_item_failed');
    }
  }
  await Promise.all(
    [snapshot.inputFileId, snapshot.outputFileId, snapshot.errorFileId]
      .filter((fileId): fileId is string => Boolean(fileId))
      .map((fileId) =>
        getAiBatchClient()
          .deleteFile(fileId)
          .catch(() => undefined),
      ),
  );
  await finishJob(job);
}

async function pollBatchJob(job: AiJobRow, items: AiJobItemRow[]) {
  if (!job.providerBatchId) throw new Error('The submitted job has no provider batch ID.');
  const snapshot = await getAiBatchClient().retrieve(job.providerBatchId);
  if (!ownsActiveLease(job)) return;
  if (snapshot.status === 'completed') return reconcileCompletedBatch(job, snapshot, items);
  if (
    snapshot.status === 'failed' ||
    snapshot.status === 'expired' ||
    snapshot.status === 'cancelled'
  ) {
    if (snapshot.outputFileId) return reconcileCompletedBatch(job, snapshot, items);
    const code = snapshot.status === 'expired' ? 'batch_expired' : 'batch_failed';
    items
      .filter((item) => item.status === 'pending')
      .forEach((item) => updateItemFailure(item, code));
    await Promise.all(
      [snapshot.inputFileId, snapshot.outputFileId, snapshot.errorFileId]
        .filter((fileId): fileId is string => Boolean(fileId))
        .map((fileId) =>
          getAiBatchClient()
            .deleteFile(fileId)
            .catch(() => undefined),
        ),
    );
    return finishJob(job);
  }
  const now = new Date();
  getDatabase()
    .update(aiJobs)
    .set({
      nextAttemptAt: new Date(now.getTime() + POLL_MS),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(and(eq(aiJobs.id, job.id), eq(aiJobs.leaseToken, job.leaseToken!)))
    .run();
}

function recoverExpiredLeases(now: Date) {
  const interrupted = getDatabase()
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.status, 'running'), lt(aiJobs.leaseExpiresAt, now)))
    .all();
  getDatabase().transaction(() => {
    for (const job of interrupted) {
      const items = getDatabase()
        .select()
        .from(aiJobItems)
        .where(and(eq(aiJobItems.jobId, job.id), eq(aiJobItems.status, 'pending')))
        .all();
      for (const item of items) updateItemFailure(item, 'worker_interrupted_review_before_retry');
    }
    getDatabase()
      .update(aiJobs)
      .set({
        status: 'failed',
        errorCode: 'worker_interrupted_review_before_retry',
        completedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(and(eq(aiJobs.status, 'running'), lt(aiJobs.leaseExpiresAt, now)))
      .run();
  });
}

/** Repair pre-fix terminal rows without restarting provider work. */
function reconcileTerminalImageCandidates() {
  const rows = getDatabase()
    .select({ item: aiJobItems, job: aiJobs })
    .from(recipeImageCandidates)
    .innerJoin(aiJobItems, eq(aiJobItems.id, recipeImageCandidates.id))
    .innerJoin(aiJobs, eq(aiJobs.id, aiJobItems.jobId))
    .where(
      and(
        eq(recipeImageCandidates.status, 'requested'),
        eq(aiJobs.kind, 'recipe_images'),
        inArray(aiJobs.status, ['failed', 'cancelled']),
      ),
    )
    .limit(100)
    .all();
  for (const { item, job } of rows) {
    if (job.status === 'cancelled')
      getDatabase()
        .update(recipeImageCandidates)
        .set({ status: 'discarded' })
        .where(
          and(eq(recipeImageCandidates.id, item.id), eq(recipeImageCandidates.status, 'requested')),
        )
        .run();
    updateItemFailure(
      item,
      job.status === 'cancelled'
        ? 'cancelled'
        : (item.errorCode ?? job.errorCode ?? 'image_generation_failed'),
    );
  }
}

function claim(job: AiJobRow): AiJobRow | null {
  const now = new Date();
  const leaseToken = randomUUID();
  const claimed = getDatabase()
    .update(aiJobs)
    .set({
      status: job.status === 'queued' ? 'running' : job.status,
      attempts: job.status === 'queued' ? job.attempts + 1 : job.attempts,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      updatedAt: now,
    })
    .where(
      and(
        eq(aiJobs.id, job.id),
        eq(aiJobs.status, job.status),
        or(isNull(aiJobs.leaseExpiresAt), lte(aiJobs.leaseExpiresAt, now)),
      ),
    )
    .run();
  if (claimed.changes !== 1) return null;
  return getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get() ?? null;
}

async function runOneAiJob(candidate: AiJobRow) {
  const job = claim(candidate);
  if (!job) return;
  const items = jobWithItems(job.id).items;
  const heartbeat = setInterval(() => {
    getDatabase()
      .update(aiJobs)
      .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
      .where(and(eq(aiJobs.id, job.id), eq(aiJobs.leaseToken, job.leaseToken!)))
      .run();
  }, 60000);
  heartbeat.unref?.();
  try {
    if (job.status !== 'submitted') {
      assertJobAiAccess(job);
      const setting = getAiWorkloadSetting(
        job.profileId,
        job.kind === 'recipe_images'
          ? 'image_generation'
          : job.kind === 'meal_plan_generation'
            ? 'meal_plan_generation'
            : 'recipe_generation',
      );
      if (!setting.enabled) throw new AiJobForbiddenError('This AI task is disabled.');
      if (job.kind === 'recipe_images' && !getAiDataPolicy(job.profileId).shareSharedRecipes)
        throw new AiJobForbiddenError('Recipe sharing is disabled for this account.');
    }
    if (job.kind === 'meal_plan_generation') {
      const { runScheduledPlanJob } = await import('./task-scheduler-service');
      await withAiExecutionContext({ parentJobId: job.id }, () => runScheduledPlanJob(job));
    } else if (job.status === 'submitted') await pollBatchJob(job, items);
    else if (job.executionMode === 'batch') await submitBatchJob(job, items);
    else await runDirectJob(job, items);
  } catch (error) {
    const now = new Date();
    const submissionUnknown =
      getDatabase()
        .select({ errorCode: aiJobs.errorCode })
        .from(aiJobs)
        .where(eq(aiJobs.id, job.id))
        .get()?.errorCode === 'provider_submission_pending';
    const failure = submissionUnknown
      ? 'provider_submission_outcome_unknown'
      : error instanceof AiBatchNotSubmittedError
        ? 'provider_submission_not_started'
        : error instanceof AiAccessDeniedError || error instanceof AiJobForbiddenError
          ? 'ai_disabled'
          : 'worker_failed';
    if (job.status !== 'submitted' && ownsActiveLease(job))
      items
        .filter((item) => item.status === 'pending')
        .forEach((item) => updateItemFailure(item, failure));
    getDatabase()
      .update(aiJobs)
      .set({
        // Polling an existing batch is safe to repeat; never submit another paid batch
        // merely because a status/output request temporarily failed.
        status: job.status === 'submitted' ? 'submitted' : 'failed',
        errorCode: job.status === 'submitted' ? 'provider_poll_retry_pending' : failure,
        nextAttemptAt: new Date(now.getTime() + Math.max(60_000, POLL_MS)),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
        completedAt: job.status === 'submitted' ? null : now,
      })
      .where(and(eq(aiJobs.id, job.id), eq(aiJobs.leaseToken, job.leaseToken!)))
      .run();
  } finally {
    clearInterval(heartbeat);
  }
}

let aiJobWorkerRunning = false;

export async function runDueAiJobs(): Promise<void> {
  if (aiJobWorkerRunning) return;
  aiJobWorkerRunning = true;
  try {
    ensureDatabase();
    const now = new Date();
    recoverExpiredLeases(now);
    reconcileTerminalImageCandidates();
    const due = getDatabase()
      .select()
      .from(aiJobs)
      .where(
        and(
          inArray(aiJobs.status, ['queued', 'submitted']),
          lte(aiJobs.nextAttemptAt, now),
          or(isNull(aiJobs.leaseExpiresAt), lte(aiJobs.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(aiJobs.nextAttemptAt), asc(aiJobs.createdAt))
      .limit(DIRECT_CONCURRENCY)
      .all();
    await Promise.all(due.map((job) => runOneAiJob(job)));
  } finally {
    aiJobWorkerRunning = false;
  }
}

export async function cancelAiJob(jobId: string, profileId: string) {
  const { job, items } = jobWithItems(jobId, profileId);
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    throw new AiJobStateError('That background AI task has already finished.');
  }
  const now = new Date();
  const cancelled = getDatabase()
    .update(aiJobs)
    .set({
      status: 'cancelled',
      errorCode: 'cancelled',
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(and(eq(aiJobs.id, job.id), inArray(aiJobs.status, ['queued', 'running', 'submitted'])))
    .run();
  if (!cancelled.changes)
    throw new AiJobStateError('This task finished before it could be cancelled.');
  if (job.kind === 'recipe_images')
    getDatabase()
      .update(recipeImageCandidates)
      .set({ status: 'discarded' })
      .where(
        and(
          inArray(
            recipeImageCandidates.id,
            items.filter((item) => item.status !== 'succeeded').map((item) => item.id),
          ),
          eq(recipeImageCandidates.status, 'requested'),
        ),
      )
      .run();
  items
    .filter((item) => item.status === 'pending')
    .forEach((item) => updateItemFailure(item, 'cancelled'));
  if (job.providerBatchId)
    await getAiBatchClient()
      .cancel(job.providerBatchId)
      .catch(() => {
        getDatabase()
          .update(aiJobs)
          .set({ errorCode: 'cancelled_provider_confirmation_pending' })
          .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, 'cancelled')))
          .run();
      });
  return getAiJob(job.id, profileId);
}

export function retryAiJob(jobId: string, profileId: string) {
  ensureDatabase();
  return getDatabase().transaction(() => retryJobTransaction(jobId, profileId));
}

function retryJobTransaction(jobId: string, profileId: string) {
  const { job, items } = jobWithItems(jobId, profileId);
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    throw new AiJobStateError('Only failed or cancelled background tasks can be retried.');
  }
  if (UNKNOWN_OUTCOMES.includes(job.errorCode ?? ''))
    throw new AiJobStateError(
      'The provider may have accepted this paid request. Reconcile its outcome before starting another paid request; this operation will not be submitted again.',
    );
  const previousResult = job.result ? (parseJson(job.result) as { retryJobId?: string }) : null;
  if (previousResult?.retryJobId) return getAiJob(previousResult.retryJobId, profileId);
  // A partially completed recipe draft may already have been accepted. Retry only
  // its failed requests in a new job so successful recipes are never proposed twice.
  if (job.kind === 'recipe_batch_generation' && job.actionId) {
    const unfinished = items
      .filter((item) => item.status !== 'succeeded')
      .map((item) => recipeItemSchema.parse(parseJson(item.payload)));
    if (!unfinished.length) throw new AiJobStateError('There is no unfinished work to retry.');
    const retry = enqueueRecipeBatchGenerationJob({
      profileId,
      threadId: job.threadId,
      model: job.model,
      recipes: unfinished,
      generateRecipeImages: z
        .object({ generateRecipeImages: z.boolean().default(false) })
        .parse(parseJson(job.payload)).generateRecipeImages,
    });
    getDatabase()
      .update(aiJobs)
      .set({ result: JSON.stringify({ ...previousResult, retryJobId: retry.id }) })
      .where(eq(aiJobs.id, job.id))
      .run();
    return retry;
  }
  if (job.kind === 'recipe_images') {
    const images = items
      .filter((item) => item.status !== 'succeeded')
      .map((item) => imageItemSchema.parse(parseJson(item.payload)));
    if (
      images.some(
        (image) =>
          !image.expectedRevision ||
          getRecipe(image.recipeId, profileId)?.currentRevision !== image.expectedRevision,
      )
    )
      throw new AiJobStateError(
        'A recipe changed or this legacy request has no reviewed revision. Prepare a new image review.',
      );
    const retry = enqueueRecipeImageJob({
      profileId,
      threadId: job.threadId,
      images,
      approvedOptions: { model: job.model, ...savedImageOptions(job) },
    });
    if (!retry) throw new AiJobStateError('There is no unfinished work to retry.');
    getDatabase()
      .update(aiJobs)
      .set({ result: JSON.stringify({ ...previousResult, retryJobId: retry.id }) })
      .where(eq(aiJobs.id, job.id))
      .run();
    return retry;
  }
  const now = new Date();
  items
    .filter((item) => item.status !== 'succeeded')
    .forEach((item) => {
      getDatabase()
        .update(aiJobItems)
        .set({
          status: 'pending',
          result: null,
          errorCode: null,
          updatedAt: now,
          completedAt: null,
        })
        .where(eq(aiJobItems.id, item.id))
        .run();
      if (item.auditId) {
        getDatabase()
          .update(aiOperationAudits)
          .set({ status: 'requested', errorCode: null, completedAt: null })
          .where(eq(aiOperationAudits.id, item.auditId))
          .run();
      }
    });
  getDatabase()
    .update(aiJobs)
    .set({
      status: 'queued',
      executionMode:
        job.kind === 'meal_plan_generation'
          ? 'direct'
          : taskExecutionMode(
              profileId,
              items.filter((item) => item.status !== 'succeeded').length,
            ),
      providerBatchId: null,
      providerInputFileId: null,
      errorCode: null,
      nextAttemptAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: null,
    })
    .where(eq(aiJobs.id, job.id))
    .run();
  void wakeAiJobWorker();
  return getAiJob(job.id, profileId);
}

export async function wakeAiJobWorker(): Promise<void> {
  // Enqueue callers may still be committing their transaction.
  await Promise.resolve();
  if (process.env.NODE_ENV !== 'production' || process.env.AI_WORKER_ENABLED === 'false') return;
  if (process.env.QUEUE_BACKEND === 'redis') {
    const { wakeTaskQueue } = await import('./task-queue-service');
    await wakeTaskQueue().catch((error) =>
      logger.child('tasks').error('Task queued in SQLite, but Redis could not be reached.', {
        error,
      }),
    );
    return;
  }
  await runDueAiJobs();
}

declare global {
  var bordAiJobWorkerTimer: ReturnType<typeof setInterval> | undefined;
}

export function startAiJobWorker(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.AI_WORKER_ENABLED === 'false') return;
  if (globalThis.bordAiJobWorkerTimer) return;
  if (process.env.QUEUE_BACKEND === 'redis') {
    void import('./task-queue-service')
      .then((module) => module.startTaskQueue())
      .catch((error) =>
        logger
          .child('tasks')
          .error('Redis task queue could not start. Check queue configuration.', { error }),
      );
    return;
  }
  const run = () =>
    void import('./task-scheduler-service')
      .then(async (module) => {
        module.enqueueScheduledPlans();
        await runDueAiJobs();
      })
      .catch((error) => logger.child('tasks').error('Background task tick failed.', { error }));
  globalThis.bordAiJobWorkerTimer = setInterval(run, POLL_MS);
  globalThis.bordAiJobWorkerTimer.unref?.();
  setTimeout(run, 1_000).unref?.();
}
