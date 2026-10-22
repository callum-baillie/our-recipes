import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  aiJobItems,
  aiJobs,
  aiOperationAudits,
  aiRuntimeSettings,
  recipeImageCandidates,
} from '@/lib/db/schema';
import { aiRuntimeSchema } from '@/lib/domain/ai-runtime-settings';
import { emptyRecipeInput } from '@/lib/domain/recipe';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { completeSetup } from '@/lib/services/household-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';
import {
  getAiDataPolicy,
  getAiWorkloadSetting,
  updateAiSettings,
} from '@/lib/services/ai-settings-service';
import {
  cancelAiJob,
  enqueueRecipeImageJob,
  getAiJob,
  retryAiJob,
  runDueAiJobs,
  setAiBatchClientForTests,
  type AiBatchClient,
} from '@/lib/services/ai-job-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import { AiProviderRequestError } from '@/lib/providers/ai-provider';
import type { AiProvider } from '@/lib/providers/ai-provider';

let profileId: string;
let submit: ReturnType<typeof vi.fn<AiBatchClient['submit']>>;
let retrieve: ReturnType<typeof vi.fn<AiBatchClient['retrieve']>>;
let read: ReturnType<typeof vi.fn<AiBatchClient['read']>>;
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  resetDatabaseForTests();
  profileId = completeSetup({
    householdName: 'Synthetic image lifecycle',
    appName: 'Bòrd',
    profile: {
      displayName: 'Alex',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'UTC',
    },
  }).profiles[0]!.id;
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({
      id: 'global',
      settings: JSON.stringify(aiRuntimeSchema.parse({ executionMode: 'batch' })),
      version: 1,
    })
    .run();
  setAiProviderForTests({
    name: 'OpenAI',
    getStatus: () => ({
      provider: 'OpenAI',
      state: 'configured',
      enabled: true,
      message: 'Synthetic',
      supportedOperationKinds: ['image-generation'],
    }),
  } as unknown as AiProvider);
  submit = vi.fn<AiBatchClient['submit']>(async () => ({
    batchId: 'synthetic-batch',
    inputFileId: 'input',
    status: 'validating',
  }));
  retrieve = vi.fn<AiBatchClient['retrieve']>(async () => ({
    id: 'synthetic-batch',
    status: 'failed',
    inputFileId: 'input',
  }));
  read = vi.fn<AiBatchClient['read']>(async () => '');
  setAiBatchClientForTests({
    submit,
    retrieve,
    read,
    cancel: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
  });
});
afterEach(() => {
  setAiProviderForTests(null);
  setAiBatchClientForTests(null);
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
function fixture() {
  const recipe = createRecipe(
    {
      ...emptyRecipeInput,
      title: 'Reviewed soup',
      servings: '4',
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: '500', unit: 'g', item: 'tomatoes', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer.'] }],
    },
    profileId,
  );
  const job = enqueueRecipeImageJob({
    profileId,
    threadId: null,
    images: [
      {
        recipeId: recipe.id,
        expectedRevision: recipe.currentRevision,
        ...recipeImageInput(recipe),
      },
    ],
  })!;
  const item = getDatabase().select().from(aiJobItems).where(eq(aiJobItems.jobId, job.id)).get()!;
  return { recipe, job, item };
}
function candidate(id: string) {
  return getDatabase()
    .select()
    .from(recipeImageCandidates)
    .where(eq(recipeImageCandidates.id, id))
    .get()!;
}
function audit(id: string) {
  return getDatabase().select().from(aiOperationAudits).where(eq(aiOperationAudits.id, id)).get()!;
}
async function submitJob(id: string) {
  await runDueAiJobs();
  expect(getAiJob(id, profileId).status).toBe('submitted');
  getDatabase()
    .update(aiJobs)
    .set({ nextAttemptAt: new Date(0) })
    .where(eq(aiJobs.id, id))
    .run();
}
describe('RV08 candidate terminal persistence', () => {
  it('preserves reviewed image settings on explicit retry after defaults change', async () => {
    const { job, item } = fixture();
    const before = getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()!;
    const approved = JSON.parse(before.payload);
    getDatabase()
      .update(aiJobs)
      .set({ status: 'failed', errorCode: 'batch_failed' })
      .where(eq(aiJobs.id, job.id))
      .run();
    getDatabase()
      .update(aiJobItems)
      .set({ status: 'failed', errorCode: 'batch_failed' })
      .where(eq(aiJobItems.id, item.id))
      .run();
    getDatabase()
      .update(aiRuntimeSettings)
      .set({
        settings: JSON.stringify(
          aiRuntimeSchema.parse({
            executionMode: 'batch',
            imageQuality: 'high',
            allowPersonalImageOverrides: true,
          }),
        ),
      })
      .where(eq(aiRuntimeSettings.id, 'global'))
      .run();
    const current = getAiWorkloadSetting(profileId, 'image_generation');
    updateAiSettings(profileId, {
      workloads: [
        {
          workload: 'image_generation',
          model: 'custom-new-image-model',
          reasoningEffort: null,
          enabled: true,
          version: current.version,
        },
      ],
    });
    const retry = retryAiJob(job.id, profileId);
    const saved = getDatabase().select().from(aiJobs).where(eq(aiJobs.id, retry.id)).get()!;
    expect(saved.model).toBe(before.model);
    expect(JSON.parse(saved.payload)).toMatchObject(approved);
    expect(
      getDatabase()
        .select()
        .from(recipeImageCandidates)
        .where(eq(recipeImageCandidates.id, retry.items[0]!.id))
        .get(),
    ).toMatchObject({ model: before.model, quality: 'low', promptVersion: approved.promptVersion });
    await runDueAiJobs();
    const request = JSON.parse(submit.mock.calls[0]![0].lines.trim()).body;
    expect(request).toMatchObject({ model: before.model, quality: 'low' });
  });
  it.each(['failed', 'unknown'] as const)(
    'preserves direct provider %s outcome and safe retry behavior',
    async (outcome) => {
      getDatabase()
        .update(aiRuntimeSettings)
        .set({ settings: JSON.stringify(aiRuntimeSchema.parse({ executionMode: 'direct' })) })
        .where(eq(aiRuntimeSettings.id, 'global'))
        .run();
      const generate = vi.fn(async () => {
        throw new AiProviderRequestError('Synthetic provider outcome', outcome);
      });
      setAiProviderForTests({
        name: 'OpenAI',
        getStatus: () => ({
          provider: 'OpenAI',
          state: 'configured',
          enabled: true,
          message: 'Synthetic',
          supportedOperationKinds: ['image-generation'],
        }),
        generateRecipeImage: generate,
      } as unknown as AiProvider);
      const { job, item } = fixture();
      await runDueAiJobs();
      expect(candidate(item.id).status).toBe(outcome === 'unknown' ? 'outcome_unknown' : 'failed');
      expect(audit(item.auditId!).status).toBe(
        outcome === 'unknown' ? 'outcome_unknown' : 'failed',
      );
      expect(getAiJob(job.id, profileId).status).toBe('failed');
      if (outcome === 'unknown')
        expect(() => retryAiJob(job.id, profileId)).toThrow(/may have accepted/);
      expect(generate).toHaveBeenCalledOnce();
    },
  );
  it('repairs a historical terminal job without repeating generation', async () => {
    const { job, item } = fixture();
    getDatabase()
      .update(aiJobs)
      .set({ status: 'failed', errorCode: 'batch_failed' })
      .where(eq(aiJobs.id, job.id))
      .run();
    await runDueAiJobs();
    expect(candidate(item.id).status).toBe('failed');
    expect(audit(item.auditId!).status).toBe('failed');
    expect(submit).not.toHaveBeenCalled();
  });
  it.each(['failed', 'expired', 'cancelled'] as const)(
    'reconciles known Batch %s without leaving a requested candidate',
    async (status) => {
      const { job, item, recipe } = fixture();
      retrieve.mockResolvedValue({ id: 'synthetic-batch', status, inputFileId: 'input' });
      await submitJob(job.id);
      await runDueAiJobs();
      expect(candidate(item.id).status).toBe('failed');
      expect(getAiJob(job.id, profileId)).toMatchObject({ status: 'failed', failedItems: 1 });
      expect(audit(item.auditId!).status).toBe('failed');
      expect(getRecipe(recipe.id)?.images).toHaveLength(0);
    },
  );
  it('reconciles per-item error rows in a completed Batch', async () => {
    const { job, item } = fixture();
    retrieve.mockResolvedValue({
      id: 'synthetic-batch',
      status: 'completed',
      outputFileId: 'output',
    });
    read.mockResolvedValue(
      JSON.stringify({ custom_id: item.customId, response: { status_code: 400 } }),
    );
    await submitJob(job.id);
    await runDueAiJobs();
    expect(candidate(item.id).status).toBe('failed');
    expect(audit(item.auditId!)).toMatchObject({
      status: 'failed',
      errorCode: 'batch_item_failed',
    });
  });
  it('reconciles policy rejection before submission without a provider call', async () => {
    const { job, item } = fixture();
    updateAiSettings(profileId, {
      dataPolicy: { ...getAiDataPolicy(profileId), shareSharedRecipes: false },
    });
    await runDueAiJobs();
    expect(submit).not.toHaveBeenCalled();
    expect(candidate(item.id).status).toBe('failed');
    expect(getAiJob(job.id, profileId).status).toBe('failed');
    expect(audit(item.auditId!).status).toBe('failed');
  });
  it('preserves discard tombstones through a late Batch failure', async () => {
    const { job, item } = fixture();
    await submitJob(job.id);
    retrieve.mockImplementation(async () => {
      await cancelAiJob(job.id, profileId);
      return { id: 'synthetic-batch', status: 'failed' };
    });
    await runDueAiJobs();
    expect(candidate(item.id).status).toBe('discarded');
    expect(getAiJob(job.id, profileId).status).toBe('cancelled');
    expect(audit(item.auditId!).status).toBe('cancelled');
  });
  it('keeps a lost submission distinct from known failure and prevents blind paid retry', async () => {
    const { job, item } = fixture();
    submit.mockRejectedValue(new Error('Lost acknowledgement'));
    await runDueAiJobs();
    expect(candidate(item.id).status).toBe('outcome_unknown');
    expect(getAiJob(job.id, profileId).items[0]?.candidateId).toBe(item.id);
    expect(audit(item.auditId!).status).toBe('outcome_unknown');
    expect(() => retryAiJob(job.id, profileId)).toThrow(/may have accepted/);
    await runDueAiJobs();
    expect(submit).toHaveBeenCalledOnce();
  });
  it('reconciles an interrupted lease conservatively without resubmitting', async () => {
    const { job, item } = fixture();
    getDatabase()
      .update(aiJobs)
      .set({ status: 'running', leaseToken: 'dead-worker', leaseExpiresAt: new Date(0) })
      .where(eq(aiJobs.id, job.id))
      .run();
    await runDueAiJobs();
    expect(candidate(item.id).status).toBe('outcome_unknown');
    expect(audit(item.auditId!).status).toBe('outcome_unknown');
    expect(() => retryAiJob(job.id, profileId)).toThrow(/may have accepted/);
    expect(submit).not.toHaveBeenCalled();
  });
});
