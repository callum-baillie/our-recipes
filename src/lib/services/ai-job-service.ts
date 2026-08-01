import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import OpenAI, { toFile } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import {
  aiChatMessages,
  aiChatThreads,
  aiJobItems,
  aiJobs,
  aiOperationAudits,
  recipeImages,
} from '@/lib/db/schema';
import { aiStructuredRecipeSchema } from '@/lib/domain/ai';
import type { AiReasoningEffort } from '@/lib/domain/ai-assistant';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { recipeImagePrompt, type AiImageGenerationInput } from '@/lib/providers/ai-provider';
import { getAiAssistantProvider } from '@/lib/providers/ai-assistant-provider';
import { getOpenAiApiKey } from '@/lib/providers/openai-key';
import { getAiProvider } from '@/lib/services/ai-readiness-service';
import { getAiWorkloadSetting } from '@/lib/services/ai-settings-service';
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
  Math.max(4, Number(process.env.AI_BATCH_MIN_ITEMS ?? '4')),
);

type AiJobRow = typeof aiJobs.$inferSelect;
type AiJobItemRow = typeof aiJobItems.$inferSelect;

type RecipeImageJobInput = AiImageGenerationInput & { recipeId: string };
type RecipeGenerationJobInput = {
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
    recipeTitle: z.string().trim().min(1).max(160),
    recipeSummary: z.string().max(800),
    ingredientNames: z.array(z.string().max(160)).max(80),
  })
  .strict();

const recipeItemSchema = z
  .object({
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

function batchMode(count: number): 'direct' | 'batch' {
  return count >= AI_BATCH_MIN_ITEMS ? 'batch' : 'direct';
}

function titleFor(job: AiJobRow): string {
  return job.kind === 'recipe_images' ? 'Recipe images' : 'Recipe set';
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
  return {
    id: job.id,
    kind: job.kind,
    title: titleFor(job),
    status: job.status,
    executionMode: job.executionMode,
    model: job.model,
    actionId: job.actionId,
    errorCode: job.errorCode,
    ...counts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
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

export function getAiJob(jobId: string, profileId: string) {
  const { job, items } = jobWithItems(jobId, profileId);
  return publicJob(job, items);
}

export function listAiJobs(input: { profileId: string; threadId?: string | null; limit?: number }) {
  ensureDatabase();
  const rows = getDatabase()
    .select()
    .from(aiJobs)
    .where(
      input.threadId
        ? and(eq(aiJobs.profileId, input.profileId), eq(aiJobs.threadId, input.threadId))
        : eq(aiJobs.profileId, input.profileId),
    )
    .orderBy(asc(aiJobs.createdAt))
    .all()
    .slice(-(input.limit ?? 25));
  return rows.map((job) => {
    const items = getDatabase().select().from(aiJobItems).where(eq(aiJobItems.jobId, job.id)).all();
    return publicJob(job, items);
  });
}

function insertImageAudit(input: {
  id: string;
  profileId: string;
  threadId: string | null;
  actionId: string | null;
  model: string;
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
}) {
  ensureDatabase();
  if (!input.images.length) return null;
  const now = new Date();
  const setting = getAiWorkloadSetting(input.profileId, 'image_generation');
  const id = randomUUID();
  const mode = batchMode(input.images.length);
  getDatabase()
    .insert(aiJobs)
    .values({
      id,
      profileId: input.profileId,
      threadId: input.threadId ?? null,
      actionId: input.actionId ?? null,
      kind: 'recipe_images',
      status: 'queued',
      executionMode: mode,
      model: setting.model,
      payload: JSON.stringify({}),
      result: null,
      sourceDigest: digest(input.images),
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
  input.images.forEach((image, position) => {
    const auditId = randomUUID();
    insertImageAudit({
      id: auditId,
      profileId: input.profileId,
      threadId: input.threadId ?? null,
      actionId: input.actionId ?? null,
      model: setting.model,
      image,
      now,
    });
    getDatabase()
      .insert(aiJobItems)
      .values({
        id: randomUUID(),
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
  void wakeAiJobWorker();
  return getAiJob(id, input.profileId);
}

export function enqueueRecipeBatchGenerationJob(input: {
  profileId: string;
  threadId: string;
  model: string;
  recipes: RecipeGenerationJobInput[];
  generateRecipeImages: boolean;
}) {
  ensureDatabase();
  if (input.recipes.length < AI_BATCH_MIN_ITEMS) {
    throw new AiJobStateError(`Batch jobs need at least ${AI_BATCH_MIN_ITEMS} recipe requests.`);
  }
  const now = new Date();
  const id = randomUUID();
  getDatabase()
    .insert(aiJobs)
    .values({
      id,
      profileId: input.profileId,
      threadId: input.threadId,
      actionId: null,
      kind: 'recipe_batch_generation',
      status: 'queued',
      executionMode: 'batch',
      model: input.model,
      payload: JSON.stringify({ generateRecipeImages: input.generateRecipeImages }),
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
  input.recipes.forEach((recipe, position) => {
    const auditId = randomUUID();
    getDatabase()
      .insert(aiOperationAudits)
      .values({
        id: auditId,
        kind: 'recipe-generation',
        status: 'requested',
        sourceDigest: digest(recipe.context),
        sourceLabel: `Queued recipe ${position + 1}`,
        provider: 'OpenAI',
        model: input.model,
        reasoningEffort: recipe.reasoningEffort,
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
  void wakeAiJobWorker();
  return getAiJob(id, input.profileId);
}

class OpenAiBatchClient implements AiBatchClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async submit(input: Parameters<AiBatchClient['submit']>[0]) {
    const file = await this.client.files.create({
      file: await toFile(Buffer.from(input.lines, 'utf8'), 'bord-ai-batch.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    });
    const batch = await this.client.batches.create({
      input_file_id: file.id,
      endpoint: input.endpoint,
      completion_window: '24h',
      metadata: input.metadata,
    });
    return { batchId: batch.id, inputFileId: file.id };
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
        return JSON.stringify({
          custom_id: item.customId,
          method: 'POST',
          url: '/v1/images/generations',
          body: {
            model: job.model,
            prompt: recipeImagePrompt(image),
            size: '1024x1024',
            quality: 'low',
            output_format: 'webp',
          },
        });
      }
      const recipe = recipeItemSchema.parse(parseJson(item.payload));
      return JSON.stringify({
        custom_id: item.customId,
        method: 'POST',
        url: '/v1/responses',
        body: {
          model: job.model,
          instructions: recipe.instructions,
          input: [
            {
              role: 'user',
              content: `Untrusted household recipe context follows:\n${JSON.stringify(recipe.context)}`,
            },
          ],
          text: { format: zodTextFormat(aiStructuredRecipeSchema, 'generated_recipe') },
          store: false,
          safety_identifier: recipe.safetyIdentifier,
          ...(recipe.reasoningEffort ? { reasoning: { effort: recipe.reasoningEffort } } : {}),
        },
      });
    })
    .join('\n');
}

function endpointFor(job: AiJobRow): '/v1/images/generations' | '/v1/responses' {
  return job.kind === 'recipe_images' ? '/v1/images/generations' : '/v1/responses';
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
  getDatabase()
    .update(aiJobItems)
    .set({ status: 'failed', errorCode, updatedAt: now, completedAt: now })
    .where(eq(aiJobItems.id, item.id))
    .run();
  if (item.auditId) {
    getDatabase()
      .update(aiOperationAudits)
      .set({ status: 'failed', errorCode, completedAt: now })
      .where(eq(aiOperationAudits.id, item.auditId))
      .run();
  }
}

async function attachRecipeImage(
  item: AiJobItemRow,
  image: RecipeImageJobInput,
  bytes: Buffer,
  altText = `AI-generated serving image for ${image.recipeTitle}`.slice(0, 180),
) {
  const imageId = randomUUID();
  const stored = await storeRecipeImage(imageId, bytes);
  try {
    getDatabase().transaction((transaction) => {
      transaction
        .insert(recipeImages)
        .values({
          id: imageId,
          recipeId: image.recipeId,
          storageKey: stored.storageKey,
          altText,
          width: stored.width,
          height: stored.height,
          createdByProfileId: jobWithItems(item.jobId).job.profileId,
          createdAt: new Date(),
        })
        .run();
      if (item.auditId) {
        transaction
          .update(aiOperationAudits)
          .set({ recipeId: image.recipeId, generatedImageId: imageId })
          .where(eq(aiOperationAudits.id, item.auditId))
          .run();
      }
    });
  } catch (error) {
    await removeRecipeImage(stored.storageKey).catch(() => undefined);
    throw error;
  }
  updateItemSuccess(item, { recipeId: image.recipeId, imageId });
}

async function processDirectImage(item: AiJobItemRow, job: AiJobRow) {
  try {
    const image = imageItemSchema.parse(parseJson(item.payload));
    const generated = await getAiProvider().generateRecipeImage(image, { model: job.model });
    await attachRecipeImage(item, image, generated.bytes, generated.altText);
  } catch {
    updateItemFailure(item, 'image_generation_failed');
  }
}

async function processDirectRecipe(item: AiJobItemRow, job: AiJobRow) {
  try {
    const request = recipeItemSchema.parse(parseJson(item.payload));
    const recipe = recipeInputSchema.parse(
      await getAiAssistantProvider().generateRecipe({
        model: job.model,
        reasoningEffort: request.reasoningEffort,
        safetyIdentifier: request.safetyIdentifier,
        instructions: request.instructions,
        context: request.context,
      }),
    );
    updateItemSuccess(item, recipe);
  } catch {
    updateItemFailure(item, 'recipe_generation_failed');
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
  const latest = jobWithItems(job.id).items;
  const counts = itemCounts(latest);
  const proposal = job.kind === 'recipe_batch_generation' ? await finishRecipeProposal(job) : null;
  const now = new Date();
  getDatabase()
    .update(aiJobs)
    .set({
      status: counts.completedItems ? 'completed' : 'failed',
      actionId: proposal?.id ?? job.actionId,
      result: JSON.stringify({ ...counts, actionId: proposal?.id ?? job.actionId }),
      errorCode: counts.failedItems ? 'partial_failure' : null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(and(eq(aiJobs.id, job.id), inArray(aiJobs.status, ['running', 'submitted'])))
    .run();
}

async function runDirectJob(job: AiJobRow, items: AiJobItemRow[]) {
  const pending = items.filter((item) => item.status === 'pending');
  for (let index = 0; index < pending.length; index += DIRECT_CONCURRENCY) {
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
  const submitted = await getAiBatchClient().submit({
    endpoint: endpointFor(job),
    lines,
    metadata: { bord_ai_job_id: job.id, bord_ai_job_kind: job.kind },
  });
  const now = new Date();
  getDatabase()
    .update(aiJobs)
    .set({
      status: 'submitted',
      providerBatchId: submitted.batchId,
      providerInputFileId: submitted.inputFileId,
      nextAttemptAt: new Date(now.getTime() + POLL_MS),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(aiJobs.id, job.id))
    .run();
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
    await attachRecipeImage(item, image, responseImageBytes(body));
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
    const row = rows.get(item.customId);
    const response = row?.response as { status_code?: unknown; body?: unknown } | undefined;
    try {
      if (Number(response?.status_code) !== 200) throw new Error('Batch item failed.');
      await materializeBatchItem(job, item, response?.body);
    } catch {
      updateItemFailure(item, 'batch_item_failed');
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
  if (snapshot.status === 'completed') return reconcileCompletedBatch(job, snapshot, items);
  if (
    snapshot.status === 'failed' ||
    snapshot.status === 'expired' ||
    snapshot.status === 'cancelled'
  ) {
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
    .where(eq(aiJobs.id, job.id))
    .run();
}

function recoverExpiredLeases(now: Date) {
  getDatabase()
    .update(aiJobs)
    .set({
      status: 'queued',
      leaseToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(and(eq(aiJobs.status, 'running'), lt(aiJobs.leaseExpiresAt, now)))
    .run();
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
    .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, job.status)))
    .run();
  if (claimed.changes !== 1) return null;
  return getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get() ?? null;
}

async function runOneAiJob(candidate: AiJobRow) {
  const job = claim(candidate);
  if (!job) return;
  const items = jobWithItems(job.id).items;
  try {
    if (job.status === 'submitted') await pollBatchJob(job, items);
    else if (job.executionMode === 'batch') await submitBatchJob(job, items);
    else await runDirectJob(job, items);
  } catch {
    const now = new Date();
    getDatabase()
      .update(aiJobs)
      .set({
        status: 'failed',
        errorCode: 'worker_failed',
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(aiJobs.id, job.id))
      .run();
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
    const due = getDatabase()
      .select()
      .from(aiJobs)
      .where(inArray(aiJobs.status, ['queued', 'submitted']))
      .orderBy(asc(aiJobs.nextAttemptAt), asc(aiJobs.createdAt))
      .all()
      .filter(
        (job) =>
          job.nextAttemptAt.getTime() <= now.getTime() &&
          (!job.leaseExpiresAt || job.leaseExpiresAt.getTime() <= now.getTime()),
      )
      .slice(0, DIRECT_CONCURRENCY);
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
  if (job.status === 'submitted' && job.providerBatchId)
    await getAiBatchClient().cancel(job.providerBatchId);
  const now = new Date();
  getDatabase()
    .update(aiJobs)
    .set({
      status: 'cancelled',
      errorCode: 'cancelled',
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(aiJobs.id, job.id))
    .run();
  items
    .filter((item) => item.status === 'pending')
    .forEach((item) => updateItemFailure(item, 'cancelled'));
  return getAiJob(job.id, profileId);
}

export function retryAiJob(jobId: string, profileId: string) {
  const { job, items } = jobWithItems(jobId, profileId);
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    throw new AiJobStateError('Only failed or cancelled background tasks can be retried.');
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
  if (process.env.NODE_ENV !== 'production' || process.env.AI_WORKER_ENABLED === 'false') return;
  await runDueAiJobs();
}

declare global {
  var bordAiJobWorkerTimer: ReturnType<typeof setInterval> | undefined;
}

export function startAiJobWorker(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.AI_WORKER_ENABLED === 'false') return;
  if (globalThis.bordAiJobWorkerTimer) return;
  const run = () => void runDueAiJobs().catch(() => undefined);
  globalThis.bordAiJobWorkerTimer = setInterval(run, POLL_MS);
  globalThis.bordAiJobWorkerTimer.unref?.();
  setTimeout(run, 1_000).unref?.();
}
