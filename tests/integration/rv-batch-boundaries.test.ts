import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  aiJobItems,
  aiJobs,
  aiRuntimeSettings,
  profileAuthLinks,
  recipeImageCandidates,
  user,
} from '@/lib/db/schema';
import { aiRuntimeSchema } from '@/lib/domain/ai-runtime-settings';
import { emptyRecipeInput } from '@/lib/domain/recipe';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { completeSetup } from '@/lib/services/household-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';
import {
  getAiDataPolicy,
  getAiWorkloadSetting,
  getAiWorkloadSettings,
  getPersonalAiSettings,
  savePersonalAiSettings,
  updateAiSettings,
} from '@/lib/services/ai-settings-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import type { AiProvider } from '@/lib/providers/ai-provider';
import {
  cancelAiJob,
  enqueueRecipeBatchGenerationJob,
  enqueueRecipeImageJob,
  OpenAiBatchClient,
  runDueAiJobs,
  setAiBatchClientForTests,
} from '@/lib/services/ai-job-service';

let profileId: string, userId: string;
let releaseUpload: () => void;
let upload: ReturnType<typeof vi.fn>;
let batchCreate: ReturnType<typeof vi.fn>;
let removeFile: ReturnType<typeof vi.fn>;
let client: OpenAiBatchClient;
let runningJob: Promise<void> | undefined;
function runJob() {
  return (runningJob = runDueAiJobs());
}
function policy(patch: Record<string, unknown> = {}) {
  const settings = JSON.stringify(
    aiRuntimeSchema.parse({ executionMode: 'batch', generationsPerTenMinutes: 100, ...patch }),
  );
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({ id: 'global', settings, version: 1 })
    .onConflictDoUpdate({ target: aiRuntimeSettings.id, set: { settings } })
    .run();
}
function sharing(patch: Record<string, unknown>) {
  updateAiSettings(profileId, { dataPolicy: { ...getAiDataPolicy(profileId), ...patch } });
}
function recipeJob() {
  sharing({ sharePantry: true });
  const original = getAiWorkloadSetting(profileId, 'recipe_generation');
  updateAiSettings(profileId, {
    workloads: [
      {
        workload: original.workload,
        model: 'gpt-5.4-mini',
        reasoningEffort: 'low',
        enabled: true,
        version: original.version,
      },
    ],
  });
  const personal = getPersonalAiSettings(userId, profileId);
  savePersonalAiSettings(userId, profileId, {
    version: personal.account.version,
    preferences: {
      ...personal.account.preferences,
      workloads: [
        {
          workload: 'recipe_generation',
          model: 'gpt-5.4-mini',
          reasoningEffort: 'high',
          enabled: true,
          version: 1,
        },
      ],
    },
  });
  return enqueueRecipeBatchGenerationJob({
    profileId,
    threadId: null,
    model: 'gpt-5.4-mini',
    generateRecipeImages: false,
    recipes: [
      {
        instructions: 'Make soup.',
        reasoningEffort: 'high',
        safetyIdentifier: 'synthetic',
        context: {
          household: {
            sharedCategories: { pantry: true },
            pantry: [{ name: 'Private pantry marker' }],
          },
        },
      },
    ],
  });
}
function imageJob() {
  const recipe = createRecipe(
    {
      ...emptyRecipeInput,
      title: 'Synthetic soup',
      servings: '2',
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: '500', unit: 'g', item: 'tomatoes', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer.'] }],
    },
    profileId,
  );
  return enqueueRecipeImageJob({
    profileId,
    threadId: null,
    images: [{ ...recipeImageInput(getRecipe(recipe.id)!), recipeId: recipe.id }],
  })!;
}
beforeEach(() => {
  runningJob = undefined;
  releaseUpload = () => {};
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/rv-batch-boundaries');
  resetDatabaseForTests();
  profileId = completeSetup({
    householdName: 'Synthetic Batch boundary',
    appName: 'Bord',
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
  userId = randomUUID();
  const now = new Date();
  getDatabase()
    .insert(user)
    .values({
      id: userId,
      name: 'Admin',
      email: `${userId}@example.test`,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  getDatabase()
    .insert(profileAuthLinks)
    .values({ profileId, userId, createdAt: now, updatedAt: now })
    .run();
  policy();
  upload = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    return { id: 'synthetic-upload' };
  });
  batchCreate = vi.fn(async () => ({ id: 'synthetic-batch' }));
  removeFile = vi.fn(async () => ({ id: 'synthetic-upload', deleted: true }));
  const transport = {
    files: { create: upload, delete: removeFile },
    batches: { create: batchCreate },
  } as unknown as NonNullable<ConstructorParameters<typeof OpenAiBatchClient>[1]>;
  client = new OpenAiBatchClient('dummy-never-used', transport);
  setAiBatchClientForTests(client);
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
});
afterEach(async () => {
  releaseUpload();
  await runningJob?.catch(() => undefined);
  setAiBatchClientForTests(null);
  setAiProviderForTests(null);
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});

describe('actual Batch transport pre-transmission authorization', () => {
  it('checks permission after file preparation and before uploading any bytes', async () => {
    const assertAuthorized = vi.fn(() => {
      throw new Error('Revoked');
    });
    await expect(
      client.submit({ endpoint: '/v1/responses', lines: '{}', metadata: {}, assertAuthorized }),
    ).rejects.toThrow(/not started/);
    expect(assertAuthorized).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
    expect(batchCreate).not.toHaveBeenCalled();
  });
  it.each(['sharing', 'reasoning', 'deadline', 'output limit', 'account', 'workload'] as const)(
    'rejects %s contraction during upload before paid batch creation',
    async (change) => {
      const job = recipeJob();
      const running = runJob();
      await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
      if (change === 'sharing') sharing({ sharePantry: false });
      if (change === 'reasoning') policy({ allowPersonalModelOverrides: false });
      if (change === 'deadline') policy({ requestTimeoutSeconds: 15 });
      if (change === 'output limit') policy({ maxOutputTokens: 512 });
      if (change === 'account') policy({ enabled: false });
      if (change === 'workload') {
        const setting = getAiWorkloadSettings(profileId).find(
          (value) => value.workload === 'recipe_generation',
        )!;
        updateAiSettings(profileId, {
          workloads: [
            {
              workload: setting.workload,
              model: setting.model,
              reasoningEffort: setting.reasoningEffort,
              enabled: false,
              version: setting.version,
            },
          ],
        });
      }
      releaseUpload();
      await running;
      expect(batchCreate).not.toHaveBeenCalled();
      expect(removeFile).toHaveBeenCalledWith('synthetic-upload', expect.any(Object));
      expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()).toMatchObject({
        status: 'failed',
        errorCode: 'provider_submission_not_started',
        providerBatchId: null,
      });
      expect(getDatabase().select().from(aiJobItems).get()).toMatchObject({
        status: 'failed',
        errorCode: 'provider_submission_not_started',
      });
    },
  );
  it('preserves cancellation during upload and does not create paid work after losing its lease', async () => {
    const job = recipeJob(),
      running = runJob();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    await cancelAiJob(job.id, profileId);
    releaseUpload();
    await running;
    expect(batchCreate).not.toHaveBeenCalled();
    expect(removeFile).toHaveBeenCalledOnce();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.status).toBe(
      'cancelled',
    );
  });
  it('submits an unchanged reviewed recipe with the original model and reasoning', async () => {
    const job = recipeJob(),
      running = runJob();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    releaseUpload();
    await running;
    expect(batchCreate).toHaveBeenCalledOnce();
    expect(removeFile).not.toHaveBeenCalled();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()).toMatchObject({
      status: 'submitted',
      errorCode: null,
      providerBatchId: 'synthetic-batch',
    });
    const file = upload.mock.calls[0]![0].file as File;
    const body = JSON.parse((await file.text()).split('\n')[0]).body;
    expect(body).toMatchObject({ model: 'gpt-5.4-mini', reasoning: { effort: 'high' } });
    expect(JSON.stringify(body.input)).toContain('Private pantry marker');
  });
  it('settles a revoked image request as failed, not pending or outcome unknown', async () => {
    const job = imageJob(),
      running = runJob();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    sharing({ shareSharedRecipes: false });
    releaseUpload();
    await running;
    expect(batchCreate).not.toHaveBeenCalled();
    expect(removeFile).toHaveBeenCalledOnce();
    expect(getDatabase().select().from(recipeImageCandidates).get()?.status).toBe('failed');
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.errorCode).toBe(
      'provider_submission_not_started',
    );
  });
  it('preserves uncertainty once the paid provider request has actually been entered', async () => {
    batchCreate.mockRejectedValueOnce(new Error('Connection lost after request transmission'));
    const job = imageJob(),
      running = runJob();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    releaseUpload();
    await running;
    expect(batchCreate).toHaveBeenCalledOnce();
    expect(removeFile).not.toHaveBeenCalled();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.errorCode).toBe(
      'provider_submission_outcome_unknown',
    );
    expect(getDatabase().select().from(recipeImageCandidates).get()?.status).toBe(
      'outcome_unknown',
    );
  });
});
