import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  aiActionProposals,
  aiChatTurns,
  aiExecutionTraces,
  aiJobItems,
  aiJobs,
  aiRuntimeSettings,
  recipeImageCandidates,
  recipes,
} from '@/lib/db/schema';
import { aiRuntimeSchema } from '@/lib/domain/ai-runtime-settings';
import { emptyRecipeInput, recipeInputSchema } from '@/lib/domain/recipe';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { completeSetup } from '@/lib/services/household-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';
import {
  createAiChatThread,
  runAiChatTurn,
  getAiChatTurnStates,
  acknowledgeAiChatTurnRecovery,
} from '@/lib/services/ai-chat-service';
import {
  setAiAssistantProviderForTests,
  type AiAssistantProvider,
} from '@/lib/providers/ai-assistant-provider';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import type { AiProvider } from '@/lib/providers/ai-provider';
import {
  getAiWorkloadSetting,
  getAiDataPolicy,
  updateAiSettings,
} from '@/lib/services/ai-settings-service';
import { buildAiSharedContext } from '@/lib/services/ai-context-service';
import {
  enqueueRecipeImageJob,
  enqueueRecipeBatchGenerationJob,
  runDueAiJobs,
  setAiBatchClientForTests,
  cancelAiJob,
  getAiJob,
} from '@/lib/services/ai-job-service';
import { acceptRecipeImageCandidate } from '@/lib/services/recipe-image-candidate-service';
import { createAiActionProposal, decideAiAction } from '@/lib/services/ai-action-service';
import {
  generateAiActionPreviewImage,
  recipeDraftImageDigest,
} from '@/lib/services/ai-action-preview-image-service';
import { executeAiWorkload } from '@/lib/services/ai-execution-service';
import { withAiExecutionContext } from '@/lib/services/ai-execution-context';
const draft = recipeInputSchema.parse({
  ...emptyRecipeInput,
  title: 'Tomato soup',
  servings: '4',
  ingredientGroups: [
    { name: 'Soup', ingredients: [{ quantity: '500', unit: 'g', item: 'tomatoes', note: '' }] },
  ],
  instructionSections: [{ title: 'Cook', steps: ['Simmer, then blend until smooth.'] }],
});
const response = {
  text: 'Review your result.',
  toolCalls: [],
  responseItems: [],
  usage: { inputTokens: 1, outputTokens: 1 },
};
let profileId: string;
let image: ReturnType<typeof vi.fn>;
let generate: ReturnType<typeof vi.fn>;
let respond: ReturnType<typeof vi.fn>;
function policy(patch: Record<string, unknown> = {}) {
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({
      id: 'global',
      settings: JSON.stringify(aiRuntimeSchema.parse({ generationsPerTenMinutes: 100, ...patch })),
      version: 1,
    })
    .onConflictDoUpdate({
      target: aiRuntimeSettings.id,
      set: {
        settings: JSON.stringify(
          aiRuntimeSchema.parse({ generationsPerTenMinutes: 100, ...patch }),
        ),
      },
    })
    .run();
}
function chat() {
  return {
    profileId,
    threadId: createAiChatThread(profileId).id,
    message: { operationId: randomUUID(), message: 'Draft tomato soup.' },
  };
}
function tool(name: string, args: unknown) {
  respond.mockResolvedValueOnce({
    ...response,
    text: '',
    toolCalls: [{ callId: randomUUID(), name, arguments: args }],
  });
}
function recipe() {
  return createRecipe(draft, profileId);
}
function owner() {
  return { userId: `profile:${profileId}`, profileId, linkedProfileId: profileId };
}
beforeEach(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/post-review-ai');
  resetDatabaseForTests();
  profileId = completeSetup({
    householdName: 'Synthetic AI kitchen',
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
  policy();
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#995533' } })
    .webp()
    .toBuffer();
  image = vi.fn(async () => ({ bytes, altText: 'A synthetic image result' }));
  generate = vi.fn(async () => draft);
  respond = vi.fn(async () => response);
  setAiProviderForTests({
    name: 'OpenAI',
    getStatus: () => ({
      provider: 'OpenAI',
      state: 'configured',
      enabled: true,
      message: 'Synthetic',
      supportedOperationKinds: ['image-generation'],
    }),
    generateRecipeImage: image,
  } as unknown as AiProvider);
  setAiAssistantProviderForTests({
    respond,
    generateRecipe: generate,
  } as unknown as AiAssistantProvider);
});
afterEach(() => {
  setAiProviderForTests(null);
  setAiAssistantProviderForTests(null);
  setAiBatchClientForTests(null);
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
describe('post-review AI execution boundaries', () => {
  it.each(['generate_recipe', 'prepare_recipe_change'])(
    'keeps %s text-only with configured image generation',
    async (name) => {
      tool(
        name,
        name === 'generate_recipe'
          ? { brief: 'Tomato soup' }
          : {
              operation: 'create',
              recipeId: '',
              expectedRevision: 1,
              recipeJson: JSON.stringify(draft),
            },
      );
      await runAiChatTurn(chat());
      expect(image).not.toHaveBeenCalled();
      expect(getDatabase().select().from(aiJobs).all()).toHaveLength(0);
      expect(getDatabase().select().from(aiActionProposals).all()).toHaveLength(1);
    },
  );
  it('propagates cancellation to a nested provider and prevents its late proposal', async () => {
    const abort = new AbortController();
    let resolve!: (value: typeof draft) => void;
    generate.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    tool('generate_recipe', { brief: 'Tomato soup' });
    const pending = runAiChatTurn({ ...chat(), signal: abort.signal });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    const options = generate.mock.calls[0]![0] as Parameters<
      AiAssistantProvider['generateRecipe']
    >[0];
    abort.abort();
    expect(options.signal?.aborted).toBe(true);
    resolve(draft);
    await expect(pending).rejects.toThrow();
    expect(getDatabase().select().from(aiActionProposals).all()).toHaveLength(0);
    expect(image).not.toHaveBeenCalled();
  });
  it('caps actual nested provider options and records sanitized effective traces', async () => {
    policy({ maxOutputTokens: 512, requestTimeoutSeconds: 15 });
    tool('generate_recipe', { brief: 'Private tomato soup brief' });
    const input = chat();
    await runAiChatTurn(input);
    expect(generate.mock.calls[0]![0]).toMatchObject({ maxOutputTokens: 512 });
    expect(
      (generate.mock.calls[0]![0] as { requestTimeoutSeconds: number }).requestTimeoutSeconds,
    ).toBeLessThanOrEqual(15);
    const traces = getDatabase().select().from(aiExecutionTraces).all();
    expect(traces.map((x) => x.workload)).toContain('recipe_generation');
    expect(traces.every((x) => x.turnId === input.message.operationId)).toBe(true);
    expect(JSON.stringify(traces)).not.toContain('Private tomato');
    expect(traces.every((x) => JSON.parse(x.optionsJson).maxOutputTokens === 512)).toBe(true);
  });
  it('caps queued direct generation against current policy while retaining the approved model and prompt', async () => {
    policy({ executionMode: 'direct', maxOutputTokens: 4096 });
    const setting = getAiWorkloadSetting(profileId, 'recipe_generation');
    const job = enqueueRecipeBatchGenerationJob({
      profileId,
      threadId: null,
      model: setting.model,
      generateRecipeImages: true,
      recipes: [
        {
          instructions: 'Create soup',
          context: { brief: 'Soup' },
          reasoningEffort: setting.reasoningEffort,
          safetyIdentifier: 'synthetic',
          promptGuidance: 'Approved template',
          promptVersion: 'fixture-v1',
          maxOutputTokens: 4096,
        },
      ],
    });
    policy({ executionMode: 'direct', maxOutputTokens: 512 });
    await runDueAiJobs();
    expect(generate.mock.calls[0]![0]).toMatchObject({
      model: setting.model,
      maxOutputTokens: 512,
      promptVersion: 'fixture-v1',
      promptGuidance: expect.stringContaining('Approved template'),
    });
    expect(getAiJob(job.id, profileId).status).toBe('completed');
    expect(image).not.toHaveBeenCalled();
  });
  it('caps the actual batch JSON and carries a submission deadline', async () => {
    policy({ executionMode: 'batch' });
    const setting = getAiWorkloadSetting(profileId, 'recipe_generation');
    let sent: { lines: string; signal?: AbortSignal; timeout?: number } | undefined;
    setAiBatchClientForTests({
      submit: async (input) => {
        sent = input;
        return { batchId: 'fixture-batch', inputFileId: 'fixture-file' };
      },
      retrieve: vi.fn(),
      read: vi.fn(),
      cancel: vi.fn(),
      deleteFile: vi.fn(),
    });
    enqueueRecipeBatchGenerationJob({
      profileId,
      threadId: null,
      model: setting.model,
      generateRecipeImages: false,
      recipes: [
        {
          instructions: 'Create soup',
          context: {},
          reasoningEffort: setting.reasoningEffort,
          safetyIdentifier: 'synthetic',
        },
      ],
    });
    policy({ executionMode: 'batch', maxOutputTokens: 512, requestTimeoutSeconds: 15 });
    await runDueAiJobs();
    expect(JSON.parse(sent!.lines).body).toMatchObject({
      model: setting.model,
      max_output_tokens: 512,
    });
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
    expect(sent?.timeout).toBeLessThanOrEqual(15000);
  });
  it('rejects a changed queued recipe before calling the image provider', async () => {
    policy({ executionMode: 'direct' });
    const saved = recipe();
    const job = enqueueRecipeImageJob({
      profileId,
      threadId: null,
      images: [{ recipeId: saved.id, ...recipeImageInput(saved) }],
    })!;
    getDatabase()
      .update(recipes)
      .set({ currentRevision: 2, title: 'Salad' })
      .where(eq(recipes.id, saved.id))
      .run();
    await runDueAiJobs();
    expect(image).not.toHaveBeenCalled();
    expect(getAiJob(job.id, profileId).status).toBe('failed');
    expect(getRecipe(saved.id)?.images).toHaveLength(0);
  });
  it('stages a queued result privately and rejects acceptance after recipe changes', async () => {
    policy({ executionMode: 'direct' });
    const saved = recipe();
    const job = enqueueRecipeImageJob({
      profileId,
      threadId: null,
      images: [{ recipeId: saved.id, ...recipeImageInput(saved) }],
    })!;
    await runDueAiJobs();
    const candidate = getDatabase().select().from(recipeImageCandidates).get()!;
    expect(candidate.status).toBe('ready');
    expect(getAiJob(job.id, profileId).items[0]?.candidateId).toBe(candidate.id);
    expect(getRecipe(saved.id)?.images).toHaveLength(0);
    getDatabase().update(recipes).set({ currentRevision: 2 }).where(eq(recipes.id, saved.id)).run();
    expect(() => acceptRecipeImageCandidate(owner(), saved.id, candidate.id)).toThrow(/changed/);
  });
  it('keeps a cancelled queued image discarded when its provider completes late', async () => {
    policy({ executionMode: 'direct' });
    const saved = recipe();
    let release!: () => void;
    const original = await (
      image as unknown as () => Promise<{ bytes: Buffer; altText: string }>
    )();
    image.mockClear();
    image.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return original;
    });
    const job = enqueueRecipeImageJob({
      profileId,
      threadId: null,
      images: [{ recipeId: saved.id, ...recipeImageInput(saved) }],
    })!;
    const running = runDueAiJobs();
    await vi.waitFor(() => expect(image).toHaveBeenCalledOnce());
    await cancelAiJob(job.id, profileId);
    release();
    await running;
    expect(getDatabase().select().from(recipeImageCandidates).get()?.status).toBe('discarded');
    expect(getRecipe(saved.id)?.images).toHaveLength(0);
  });
  it('requires separate draft image consent, replays the receipt and never resurrects a closed draft', async () => {
    const action = createAiActionProposal({
      profileId,
      kind: 'recipe_create',
      payload: { recipe: draft },
      preview: { recipe: draft },
    });
    await expect(
      generateAiActionPreviewImage({ profileId, actionId: action.id, recipe: draft }),
    ).rejects.toThrow();
    expect(image).not.toHaveBeenCalled();
    let release!: () => void;
    const original = await (
      image as unknown as () => Promise<{ bytes: Buffer; altText: string }>
    )();
    image.mockClear();
    image.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return original;
    });
    const input = {
      profileId,
      actionId: action.id,
      confirm: true as const,
      operationId: randomUUID(),
      expectedSourceDigest: recipeDraftImageDigest(draft),
    };
    const running = generateAiActionPreviewImage(input);
    await vi.waitFor(() => expect(image).toHaveBeenCalledOnce());
    await generateAiActionPreviewImage(input);
    expect(image).toHaveBeenCalledOnce();
    await decideAiAction(action.id, profileId, 'cancel');
    release();
    await expect(running).rejects.toThrow(/closed|changed/);
    expect(getDatabase().select().from(recipeImageCandidates).all()).toHaveLength(0);
  });
  it('expires abandoned owned turns, exposes their exact outputs and requires recovery review', async () => {
    const input = chat();
    await runAiChatTurn(input);
    getDatabase()
      .update(aiChatTurns)
      .set({ status: 'running', resultJson: null, leaseExpiresAt: new Date(0) })
      .where(eq(aiChatTurns.id, input.message.operationId))
      .run();
    const proposal = withAiExecutionContext({ turnId: input.message.operationId }, () =>
      createAiActionProposal({
        profileId,
        threadId: input.threadId,
        kind: 'recipe_create',
        payload: { recipe: draft },
        preview: { recipe: draft },
      }),
    );
    const state = getAiChatTurnStates(
      input.threadId,
      profileId,
      owner().userId,
      input.message.operationId,
    );
    expect(state[0]).toMatchObject({
      status: 'outcome_unknown',
      reviewed: false,
      actions: [{ id: proposal.id }],
    });
    await expect(
      runAiChatTurn({
        ...input,
        message: { operationId: randomUUID(), message: 'Another request' },
      }),
    ).rejects.toThrow(/Review|review/);
    acknowledgeAiChatTurnRecovery(
      input.threadId,
      profileId,
      owner().userId,
      input.message.operationId,
    );
    await runAiChatTurn({
      ...input,
      message: { operationId: randomUUID(), message: 'New deliberate request' },
    });
    expect(respond).toHaveBeenCalledTimes(2);
  });
  it('tombstones an explicitly reviewed absent operation so a delayed request cannot start', async () => {
    const input = chat();
    expect(
      getAiChatTurnStates(input.threadId, profileId, owner().userId, input.message.operationId),
    ).toEqual([]);
    acknowledgeAiChatTurnRecovery(
      input.threadId,
      profileId,
      owner().userId,
      input.message.operationId,
    );
    await expect(runAiChatTurn(input)).rejects.toThrow(/different conversation/);
    expect(respond).not.toHaveBeenCalled();
    expect(
      getAiChatTurnStates(input.threadId, profileId, owner().userId, input.message.operationId)[0]
        ?.reviewed,
    ).toBe(true);
  });
  it('rejects incompatible reviewed model/reasoning combinations and policy-revoked overrides before provider work', async () => {
    const call = vi.fn(async () => draft);
    await expect(
      executeAiWorkload(profileId, 'recipe_generation', call, {
        model: 'gpt-image-2',
        reasoningEffort: null,
      }),
    ).rejects.toThrow(/incompatible/);
    await expect(
      executeAiWorkload(profileId, 'recipe_generation', call, {
        model: 'gpt-4o',
        reasoningEffort: 'high',
      }),
    ).rejects.toThrow(/incompatible/);
    await expect(
      executeAiWorkload(profileId, 'recipe_generation', call, {
        model: 'gpt-5.4-mini',
        reasoningEffort: 'max',
      }),
    ).rejects.toThrow(/incompatible/);
    policy({ allowPersonalModelOverrides: false });
    await expect(
      executeAiWorkload(profileId, 'recipe_generation', call, {
        model: 'gpt-4o',
        reasoningEffort: null,
      }),
    ).rejects.toThrow(/no longer allowed/);
    expect(call).not.toHaveBeenCalled();
    policy();
    await executeAiWorkload(profileId, 'recipe_generation', call, {
      model: 'gpt-5.4-mini',
      reasoningEffort: 'high',
    });
    expect(call).toHaveBeenCalledOnce();
  });
  it('records unknown paid batch submission and refuses a duplicate retry', async () => {
    policy({ executionMode: 'batch' });
    const setting = getAiWorkloadSetting(profileId, 'recipe_generation');
    const submit = vi.fn(async () => {
      throw new Error('Lost provider acknowledgement');
    });
    setAiBatchClientForTests({
      submit,
      retrieve: vi.fn(),
      read: vi.fn(),
      cancel: vi.fn(),
      deleteFile: vi.fn(),
    });
    const job = enqueueRecipeBatchGenerationJob({
      profileId,
      threadId: null,
      model: setting.model,
      generateRecipeImages: false,
      recipes: [
        {
          instructions: 'Create soup',
          context: {},
          reasoningEffort: setting.reasoningEffort,
          safetyIdentifier: 'synthetic',
        },
      ],
    });
    await runDueAiJobs();
    expect(getAiJob(job.id, profileId)).toMatchObject({
      status: 'failed',
      errorCode: 'provider_submission_outcome_unknown',
    });
    const { retryAiJob } = await import('@/lib/services/ai-job-service');
    expect(() => retryAiJob(job.id, profileId)).toThrow(/may have accepted/);
    await runDueAiJobs();
    expect(submit).toHaveBeenCalledOnce();
  });
  it('enforces the durable account request limit at the provider boundary', async () => {
    policy({ generationsPerTenMinutes: 1 });
    const call = vi.fn(async () => draft);
    await executeAiWorkload(profileId, 'recipe_generation', call);
    await expect(executeAiWorkload(profileId, 'recipe_generation', call)).rejects.toThrow(/limit/);
    expect(call).toHaveBeenCalledOnce();
  });
  it.each(['direct', 'batch'] as const)(
    'does not transmit queued household evidence after sharing is revoked (%s)',
    async (executionMode) => {
      policy({ executionMode });
      updateAiSettings(profileId, {
        dataPolicy: { ...getAiDataPolicy(profileId), shareDietaryPreferences: true },
      });
      const household = buildAiSharedContext(profileId);
      expect(household.profiles[0]).toHaveProperty('dietaryPreferences');
      const setting = getAiWorkloadSetting(profileId, 'recipe_generation');
      const submit = vi.fn();
      setAiBatchClientForTests({
        submit,
        retrieve: vi.fn(),
        read: vi.fn(),
        cancel: vi.fn(),
        deleteFile: vi.fn(),
      });
      const job = enqueueRecipeBatchGenerationJob({
        profileId,
        threadId: null,
        model: setting.model,
        generateRecipeImages: false,
        recipes: [
          {
            instructions: 'Create a soup',
            context: { brief: 'Soup', household },
            safetyIdentifier: 'synthetic',
            reasoningEffort: setting.reasoningEffort,
          },
        ],
      });
      updateAiSettings(profileId, {
        dataPolicy: { ...getAiDataPolicy(profileId), shareDietaryPreferences: false },
      });
      await runDueAiJobs();
      expect(generate).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
      expect(getAiJob(job.id, profileId).status).toBe('failed');
      expect(getDatabase().select().from(aiExecutionTraces).all()).toHaveLength(0);
    },
  );
  it('rechecks weight permission for mass values nested within saved body metrics', async () => {
    policy({ executionMode: 'direct' });
    updateAiSettings(profileId, {
      dataPolicy: { ...getAiDataPolicy(profileId), sharePersonalMetrics: true, shareWeight: true },
    });
    const setting = getAiWorkloadSetting(profileId, 'recipe_generation');
    const job = enqueueRecipeBatchGenerationJob({
      profileId,
      threadId: null,
      model: setting.model,
      generateRecipeImages: false,
      recipes: [
        {
          instructions: 'Create soup',
          context: {
            household: {
              profiles: [{ key: profileId, enteredBodyMetrics: { muscleMassKilograms: 40 } }],
            },
          },
          safetyIdentifier: 'synthetic',
          reasoningEffort: setting.reasoningEffort,
        },
      ],
    });
    updateAiSettings(profileId, {
      dataPolicy: { ...getAiDataPolicy(profileId), shareWeight: false },
    });
    await runDueAiJobs();
    expect(generate).not.toHaveBeenCalled();
    expect(getAiJob(job.id, profileId).status).toBe('failed');
  });
  it('does not resurrect an interrupted turn when a delayed provider reply arrives', async () => {
    const input = chat();
    respond.mockImplementationOnce(async () => {
      getDatabase()
        .update(aiChatTurns)
        .set({ status: 'outcome_unknown', leaseToken: null })
        .where(eq(aiChatTurns.id, input.message.operationId))
        .run();
      return response;
    });
    await expect(runAiChatTurn(input)).rejects.toThrow(/lease/);
    expect(
      getDatabase()
        .select()
        .from(aiChatTurns)
        .where(eq(aiChatTurns.id, input.message.operationId))
        .get(),
    ).toMatchObject({ status: 'outcome_unknown', resultJson: null });
    expect(respond).toHaveBeenCalledOnce();
  });
  it('refuses legacy queued images with no known reviewed revision', async () => {
    policy({ executionMode: 'direct' });
    const saved = recipe();
    const job = enqueueRecipeImageJob({
      profileId,
      threadId: null,
      images: [{ recipeId: saved.id, ...recipeImageInput(saved) }],
    })!;
    getDatabase()
      .update(aiJobItems)
      .set({ payload: JSON.stringify({ recipeId: saved.id, ...recipeImageInput(saved) }) })
      .where(eq(aiJobItems.jobId, job.id))
      .run();
    await runDueAiJobs();
    expect(image).not.toHaveBeenCalled();
    expect(getAiJob(job.id, profileId).status).toBe('failed');
  });
});
