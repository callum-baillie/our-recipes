import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, it, expect, vi, type Mock } from 'vitest';
import {
  getDatabase,
  getSqliteDatabase,
  ensureDatabase,
  resetDatabaseForTests,
} from '@/lib/db/client';
import {
  aiActionProposals,
  aiChatThreads,
  aiChatMessages,
  aiChatTurns,
  aiJobs,
  aiJobItems,
  aiExecutionTraces,
  aiRuntimeSettings,
  taskPreferences,
  user,
  profileAuthLinks,
} from '@/lib/db/schema';
import { aiRuntimeSchema } from '@/lib/domain/ai-runtime-settings';
import { taskSettingsSchema } from '@/lib/domain/task-settings';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import type { AiProvider } from '@/lib/providers/ai-provider';
import { emptyRecipeInput, recipeInputSchema } from '@/lib/domain/recipe';
import { completeSetup, addProfile } from '@/lib/services/household-service';
import { createRecipe } from '@/lib/services/recipe-service';
import {
  createAiChatThread,
  runAiChatTurn,
  listAiChatThreads,
  acknowledgeAiChatTurnRecovery,
  getAiChatTurnStates,
} from '@/lib/services/ai-chat-service';
import {
  OpenAiAssistantProvider,
  setAiAssistantProviderForTests,
} from '@/lib/providers/ai-assistant-provider';
import {
  getAiWorkloadSetting,
  getAiDataPolicy,
  updateAiSettings,
  getPersonalAiSettings,
  savePersonalAiSettings,
} from '@/lib/services/ai-settings-service';
import { getEffectivePrompt, savePrompt } from '@/lib/services/ai-prompt-service';
import {
  captureAiExecutionApproval,
  resolveAiExecutionOptions,
} from '@/lib/services/ai-execution-service';
import { enqueueScheduledPlans } from '@/lib/services/task-scheduler-service';
import { generateAiMealPlanProposal } from '@/lib/services/ai-meal-plan-service';
import {
  enqueueRecipeBatchGenerationJob,
  enqueueRecipeImageJob,
  runDueAiJobs,
  setAiBatchClientForTests,
} from '@/lib/services/ai-job-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';

const profileInput = {
  displayName: 'Alex',
  color: '#637A45',
  avatarUrl: '',
  units: 'metric' as const,
  temperatureUnit: 'C' as const,
  locale: 'en-GB',
  timezone: 'UTC',
};
const draft = recipeInputSchema.parse({
  ...emptyRecipeInput,
  title: 'Distinctive tomato soup',
  servings: '2',
  ingredientGroups: [
    { name: 'Soup', ingredients: [{ quantity: '500', unit: 'g', item: 'tomatoes', note: '' }] },
  ],
  instructionSections: [{ title: 'Cook', steps: ['Simmer, then blend.'] }],
});
let profileId: string;
let principal: RequestPrincipal;
type ResponsesClient = NonNullable<ConstructorParameters<typeof OpenAiAssistantProvider>[1]>;
let create: Mock<ResponsesClient['create']>;
let parse: Mock<ResponsesClient['parse']>;
type SerializedRequest = {
  model: string;
  instructions: string;
  input: unknown;
  max_output_tokens: number;
  reasoning?: { effort: string };
};
const serialized: SerializedRequest[] = [];
const requestOptions: Array<{ timeout?: number; signal?: AbortSignal } | undefined> = [];
function policy(patch: Record<string, unknown> = {}) {
  const settings = JSON.stringify(
    aiRuntimeSchema.parse({ generationsPerTenMinutes: 100, ...patch }),
  );
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({ id: 'global', settings, version: 1 })
    .onConflictDoUpdate({ target: aiRuntimeSettings.id, set: { settings } })
    .run();
}
function sharing(id: string, patch: Record<string, unknown>) {
  updateAiSettings(id, { dataPolicy: { ...getAiDataPolicy(id), ...patch } });
}
function workload(
  name: 'chat' | 'recipe_generation' | 'meal_plan_generation',
  patch: Record<string, unknown>,
) {
  const setting = getAiWorkloadSetting(profileId, name);
  updateAiSettings(profileId, {
    workloads: [
      {
        workload: name,
        model: setting.model,
        reasoningEffort: setting.reasoningEffort,
        enabled: setting.enabled,
        version: setting.version,
        ...patch,
      },
    ],
  });
}
function personal(instructions: string, task?: 'recipe_generation' | 'meal_plan_generation') {
  const current = getPersonalAiSettings(principal.userId, profileId);
  savePersonalAiSettings(principal.userId, profileId, {
    version: current.account.version,
    preferences: {
      ...current.account.preferences,
      instructions,
      workloads: task
        ? [
            {
              workload: task,
              model: 'gpt-5.4-mini',
              reasoningEffort: 'high',
              enabled: true,
              version: 1,
            },
          ]
        : [],
    },
  });
}
function message(threadId: string = createAiChatThread(profileId).id) {
  return {
    profileId,
    principal,
    threadId,
    message: { operationId: randomUUID(), message: 'Read the permitted kitchen records.' },
  };
}
function tool(name: string, args: unknown = {}) {
  return {
    output: [
      { type: 'function_call', call_id: randomUUID(), name, arguments: JSON.stringify(args) },
    ],
  };
}
function schedule() {
  const now = new Date();
  getDatabase()
    .insert(taskPreferences)
    .values({
      profileId,
      userId: principal.userId,
      settings: JSON.stringify(
        taskSettingsSchema.parse({
          weeklyPlanEnabled: true,
          allowPaidGeneration: true,
          weekday: now.getUTCDay(),
          hour: 0,
          timezone: 'UTC',
          days: 1,
          aheadDays: 1,
          selectedProfileIds: [profileId],
        }),
      ),
      version: 1,
      updatedAt: now,
    })
    .run();
  enqueueScheduledPlans(now);
  return getDatabase().select().from(aiJobs).get()!;
}
function candidate(date: string, recipeId: string | null = null) {
  return {
    newRecipes: recipeId ? [] : [{ key: 'soup', recipe: draft }],
    entries: [
      {
        entryKey: `${date}:dinner`,
        plannedFor: date,
        meal: 'dinner',
        existingRecipeId: recipeId,
        newRecipeKey: recipeId ? null : 'soup',
        title: draft.title,
        servings: 2,
        note: '',
      },
    ],
    allocations: [],
    leftoverLinks: [],
    warnings: [],
    assumptions: [],
  };
}
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/rv-ai-boundaries');
  resetDatabaseForTests();
  profileId = completeSetup({
    householdName: 'Synthetic boundary kitchen',
    appName: 'Bord',
    profile: profileInput,
  }).profiles[0]!.id;
  const userId = randomUUID(),
    now = new Date();
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
    .values({ userId, profileId, createdAt: now, updatedAt: now })
    .run();
  principal = {
    userId,
    profileId,
    linkedProfileId: profileId,
    role: 'admin',
    accountRole: 'admin',
    activeProfileRole: 'admin',
    kind: 'session',
    sessionId: 'synthetic',
    apiKeyId: null,
  };
  policy();
  serialized.length = 0;
  requestOptions.length = 0;
  create = vi.fn<ResponsesClient['create']>(async () => ({
    output_text: 'Finished permitted reading.',
    output: [],
  }));
  parse = vi.fn<ResponsesClient['parse']>(async () => ({ output_parsed: draft }));
  setAiAssistantProviderForTests(
    new OpenAiAssistantProvider('dummy-never-used', {
      create: async (request, options) => {
        serialized.push(JSON.parse(JSON.stringify(request)));
        requestOptions.push(options);
        return create(request, options);
      },
      parse: async (request, options) => {
        serialized.push(JSON.parse(JSON.stringify(request)));
        requestOptions.push(options);
        return parse(request, options);
      },
    }),
  );
});
afterEach(() => {
  setAiAssistantProviderForTests(null);
  setAiProviderForTests(null);
  setAiBatchClientForTests(null);
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});

describe('RV04 actual provider privacy boundary', () => {
  it('honours a stricter round limit before a later serialized provider request', async () => {
    policy({ toolRoundLimit: 8 });
    create.mockImplementationOnce(async () => {
      policy({ toolRoundLimit: 1 });
      return tool('read_household_profiles');
    });
    await expect(runAiChatTurn(message())).rejects.toThrow(/tool-round limit changed/);
    expect(serialized).toHaveLength(1);
  });

  it('stops retained household and tool evidence after another member revokes sharing', async () => {
    const member = addProfile({ ...profileInput, displayName: 'Private Member Marker' });
    sharing(member.id, { shareIdentity: true });
    create.mockResolvedValueOnce(tool('read_household_profiles'));
    create.mockImplementationOnce(async () => {
      sharing(member.id, { shareIdentity: false });
      return tool('read_household_profiles');
    });
    await expect(runAiChatTurn(message())).rejects.toThrow(/sharing or household access changed/);
    expect(serialized).toHaveLength(2);
    expect(JSON.stringify(serialized[0].input)).toContain('Private Member Marker');
    expect(JSON.stringify(serialized[1].input)).toContain('function_call_output');
    expect(JSON.stringify(serialized[1].input)).toContain('Private Member Marker');
  });
  it('stops accumulated recipe evidence after its sharing category is revoked', async () => {
    const recipe = createRecipe(draft, profileId);
    sharing(profileId, { shareSharedRecipes: true });
    create.mockResolvedValueOnce(tool('get_recipe', { recipeId: recipe.id }));
    create.mockImplementationOnce(async () => {
      sharing(profileId, { shareSharedRecipes: false });
      return tool('search_recipes', { query: 'soup' });
    });
    await expect(runAiChatTurn(message())).rejects.toThrow(/sharing or household access changed/);
    expect(serialized).toHaveLength(2);
    expect(JSON.stringify(serialized[1].input)).toContain(draft.title);
  });
  it('stops stale authority despite an unchanged input principal', async () => {
    const backupAdmin = randomUUID();
    getDatabase()
      .insert(user)
      .values({
        id: backupAdmin,
        name: 'Backup admin',
        email: `${backupAdmin}@example.test`,
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    const backupProfile = addProfile({ ...profileInput, displayName: 'Backup admin' });
    getDatabase()
      .insert(profileAuthLinks)
      .values({
        userId: backupAdmin,
        profileId: backupProfile.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    create.mockImplementationOnce(async () => {
      getDatabase().update(user).set({ role: 'parent' }).where(eq(user.id, principal.userId)).run();
      return tool('read_household_profiles');
    });
    await expect(runAiChatTurn(message())).rejects.toThrow(/sharing or household access changed/);
    expect(serialized).toHaveLength(1);
  });
  it('permits unchanged authority and output-only preference edits across tool rounds', async () => {
    create.mockResolvedValueOnce(tool('read_household_profiles'));
    create.mockImplementationOnce(async () => {
      sharing(profileId, { summaryFrequency: 'off' });
      return { output_text: 'Done.', output: [] };
    });
    await runAiChatTurn(message());
    expect(serialized).toHaveLength(2);
    expect(listAiChatThreads(profileId)[0]).not.toHaveProperty('privacyScopeJson');
  });
  it('blocks retained history in a later turn and preserves it for local review', async () => {
    sharing(profileId, { sharePantry: true });
    const input = message();
    await runAiChatTurn(input);
    const count = getDatabase().select().from(aiChatMessages).all().length;
    sharing(profileId, { sharePantry: false });
    await expect(runAiChatTurn(message(input.threadId))).rejects.toThrow(
      /Start a new conversation/,
    );
    expect(serialized).toHaveLength(1);
    expect(getDatabase().select().from(aiChatMessages).all()).toHaveLength(count);
    await runAiChatTurn(message());
    expect(serialized).toHaveLength(2);
  });
  it('keeps privacy restrictions after interrupted-turn recovery is acknowledged', async () => {
    sharing(profileId, { shareIdentity: true });
    const input = message();
    await runAiChatTurn(input);
    getDatabase()
      .update(aiChatTurns)
      .set({ status: 'running', resultJson: null, leaseExpiresAt: new Date(0) })
      .where(eq(aiChatTurns.id, input.message.operationId))
      .run();
    getAiChatTurnStates(input.threadId, profileId, principal.userId);
    acknowledgeAiChatTurnRecovery(
      input.threadId,
      profileId,
      principal.userId,
      input.message.operationId,
    );
    sharing(profileId, { shareIdentity: false });
    await expect(runAiChatTurn(message(input.threadId))).rejects.toThrow(
      /Start a new conversation/,
    );
    expect(serialized).toHaveLength(1);
  });
  it('does not invent a privacy baseline for legacy history', async () => {
    const input = message();
    await runAiChatTurn(input);
    getDatabase()
      .update(aiChatThreads)
      .set({ privacyScopeJson: null })
      .where(eq(aiChatThreads.id, input.threadId))
      .run();
    await expect(runAiChatTurn(message(input.threadId))).rejects.toThrow(/older conversation/);
    expect(serialized).toHaveLength(1);
  });
});

describe('RV04 additive privacy migration', () => {
  it('adds an unknown baseline to old threads without changing their saved messages', async () => {
    const input = message();
    await runAiChatTurn(input);
    const directory = mkdtempSync(join(tmpdir(), 'bord-chat-privacy-upgrade-'));
    const path = join(directory, 'legacy.db');
    try {
      await getSqliteDatabase().backup(path);
      const old = new Database(path);
      old.exec(
        'ALTER TABLE ai_chat_threads DROP COLUMN privacy_scope_json; DELETE FROM __drizzle_migrations WHERE created_at >= 1792540800000;',
      );
      old.close();
      resetDatabaseForTests();
      vi.stubEnv('DATABASE_URL', path);
      ensureDatabase();
      expect(getDatabase().select().from(aiChatThreads).get()?.privacyScopeJson).toBeNull();
      expect(getDatabase().select().from(aiChatMessages).all()).toHaveLength(2);
      expect(getSqliteDatabase().pragma('foreign_key_check')).toEqual([]);
      await expect(runAiChatTurn(message(input.threadId))).rejects.toThrow(/older conversation/);
      expect(serialized).toHaveLength(1);
    } finally {
      resetDatabaseForTests();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('RV05 scheduled approved configuration', () => {
  it('continues a newly generated scheduled draft with its original authorized privacy scope', async () => {
    sharing(profileId, { sharePantry: true });
    const recipe = createRecipe(draft, profileId),
      job = schedule();
    const payload = JSON.parse(job.payload);
    const seeded = getDatabase()
      .select()
      .from(aiChatThreads)
      .where(eq(aiChatThreads.id, job.threadId!))
      .get()!;
    expect(JSON.parse(seeded.privacyScopeJson!)).toMatchObject({
      owner: principal.userId,
      accountPresent: true,
      household: true,
    });
    expect(getDatabase().select().from(aiActionProposals).all()).toHaveLength(0);
    parse.mockResolvedValueOnce({ output_parsed: candidate(payload.request.startDate, recipe.id) });
    await runDueAiJobs();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.status).toBe(
      'completed',
    );
    await runAiChatTurn(message(job.threadId!));
    expect(serialized).toHaveLength(2);
    expect(JSON.stringify(serialized[1].input)).toContain('Temporary drafts for this conversation');
    expect(JSON.stringify(serialized[1].input)).toContain(draft.title);
  });
  it('refuses continued scheduled evidence after another household member revokes sharing', async () => {
    const member = addProfile({ ...profileInput, displayName: 'Scheduled private member' });
    sharing(member.id, { shareIdentity: true });
    const recipe = createRecipe(draft, profileId),
      job = schedule();
    parse.mockResolvedValueOnce({
      output_parsed: candidate(JSON.parse(job.payload).request.startDate, recipe.id),
    });
    await runDueAiJobs();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.status).toBe(
      'completed',
    );
    sharing(member.id, { shareIdentity: false });
    await expect(runAiChatTurn(message(job.threadId!))).rejects.toThrow(/Start a new conversation/);
    expect(serialized).toHaveLength(1);
  });
  it('refuses scheduled materialized scope contraction before generation starts', async () => {
    sharing(profileId, { sharePantry: true });
    const job = schedule();
    sharing(profileId, { sharePantry: false });
    await runDueAiJobs();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.status).toBe(
      'failed',
    );
    expect(serialized).toHaveLength(0);
  });

  it('materializes prompt/model/effort/personal instructions and applies stricter current caps', async () => {
    workload('meal_plan_generation', { model: 'gpt-5.4-mini', reasoningEffort: 'high' });
    personal('Approved personal marker');
    const prompt = getEffectivePrompt('meal_plan_generation');
    savePrompt(principal, {
      workload: 'meal_plan_generation',
      expectedVersion: prompt.version,
      template: `${prompt.template}\nApproved prompt marker`,
      changeNote: 'Synthetic fixture',
    });
    const recipe = createRecipe(draft, profileId);
    const job = schedule();
    const payload = JSON.parse(job.payload);
    expect(payload.approvedOptions).toMatchObject({
      model: 'gpt-5.4-mini',
      reasoningEffort: 'high',
      personalInstructions: 'Approved personal marker',
    });
    workload('meal_plan_generation', { model: 'gpt-5.4', reasoningEffort: 'low' });
    personal('Changed personal marker');
    const next = getEffectivePrompt('meal_plan_generation');
    savePrompt(principal, {
      workload: 'meal_plan_generation',
      expectedVersion: next.version,
      template: `${prompt.template}\nChanged prompt marker`,
      changeNote: 'Synthetic change',
    });
    policy({ maxOutputTokens: 512, requestTimeoutSeconds: 15 });
    parse.mockResolvedValueOnce({ output_parsed: candidate(payload.request.startDate, recipe.id) });
    await runDueAiJobs();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.status).toBe(
      'completed',
    );
    expect(JSON.parse(getDatabase().select().from(aiActionProposals).get()!.preview)).toMatchObject(
      { model: 'gpt-5.4-mini', promptVersion: payload.approvedOptions.promptVersion },
    );
    expect(serialized).toHaveLength(1);
    expect(serialized[0]).toMatchObject({
      model: 'gpt-5.4-mini',
      reasoning: { effort: 'high' },
      max_output_tokens: 512,
    });
    expect(serialized[0].instructions).toContain('Approved prompt marker');
    expect(serialized[0].instructions).toContain('Approved personal marker');
    expect(serialized[0].instructions).not.toContain('Changed prompt marker');
    expect(serialized[0].instructions).not.toContain('Changed personal marker');
    expect(serialized[0].instructions.match(/Approved prompt marker/g)).toHaveLength(1);
    expect(requestOptions[0]?.timeout).toBeLessThanOrEqual(15000);
    expect(getDatabase().select().from(aiExecutionTraces).get()?.promptVersion).toBe(
      payload.approvedOptions.promptVersion,
    );
  });
  it('rejects legacy jobs without an approval snapshot before any provider call', async () => {
    const job = schedule(),
      payload = JSON.parse(job.payload);
    delete payload.approvedOptions;
    getDatabase()
      .update(aiJobs)
      .set({ payload: JSON.stringify(payload) })
      .where(eq(aiJobs.id, job.id))
      .run();
    await runDueAiJobs();
    expect(serialized).toHaveLength(0);
    expect(getDatabase().select().from(aiJobs).get()?.status).toBe('failed');
  });
  it('passes the same approved options through recipebook missing-meal generation', async () => {
    workload('meal_plan_generation', { model: 'gpt-5.4-mini', reasoningEffort: 'high' });
    const approvedOptions = captureAiExecutionApproval(profileId, 'meal_plan_generation');
    workload('meal_plan_generation', { model: 'gpt-5.4', reasoningEffort: 'low' });
    parse.mockResolvedValueOnce({ output_parsed: candidate('2026-10-24') });
    await generateAiMealPlanProposal({
      actorProfileId: profileId,
      threadId: null,
      approvedOptions,
      request: {
        mode: 'recipebook',
        startDate: '2026-10-24',
        endDate: '2026-10-24',
        mealSlots: ['dinner'],
        servings: 2,
        sourceMode: 'new',
        selectedProfileIds: [profileId],
        options: { followNutrition: false, generateMissingRecipes: true },
      },
    });
    expect(serialized[0]).toMatchObject({ model: 'gpt-5.4-mini', reasoning: { effort: 'high' } });
  });
});

describe('RV06 reviewed reasoning revocation', () => {
  it.each(['direct', 'batch'] as const)(
    'blocks same-model personal reasoning after revocation at the %s provider boundary',
    async (executionMode) => {
      workload('recipe_generation', { model: 'gpt-5.4-mini', reasoningEffort: 'low' });
      personal('Style', 'recipe_generation');
      policy({ executionMode });
      const approved = captureAiExecutionApproval(profileId, 'recipe_generation');
      const queued = enqueueRecipeBatchGenerationJob({
        profileId,
        threadId: null,
        model: approved.model,
        generateRecipeImages: false,
        recipes: [
          {
            instructions: 'Make soup',
            context: {},
            safetyIdentifier: 'fixture',
            reasoningEffort: approved.reasoningEffort,
          },
        ],
      });
      const submit = vi.fn(async (_input: { lines: string }) => {
        void _input;
        return { batchId: 'synthetic', inputFileId: 'file' };
      });
      setAiBatchClientForTests({
        submit,
        retrieve: vi.fn(),
        read: vi.fn(),
        cancel: vi.fn(),
        deleteFile: vi.fn(),
      });
      policy({ executionMode, allowPersonalModelOverrides: false });
      expect(() => resolveAiExecutionOptions(profileId, 'recipe_generation', approved)).toThrow(
        /model or reasoning/,
      );
      await runDueAiJobs();
      expect(serialized).toHaveLength(0);
      expect(submit).not.toHaveBeenCalled();
      expect(
        getDatabase().select().from(aiJobs).where(eq(aiJobs.id, queued.id)).get()?.status,
      ).toBe('failed');
      expect(getDatabase().select().from(aiJobItems).get()?.status).toBe('failed');
    },
  );
  it.each(['direct', 'batch'] as const)(
    'retains still-permitted reasoning and frozen instructions with stricter caps in %s',
    async (executionMode) => {
      workload('recipe_generation', { model: 'gpt-5.4-mini', reasoningEffort: 'high' });
      policy({ executionMode });
      personal('Approved queued style');
      enqueueRecipeBatchGenerationJob({
        profileId,
        threadId: null,
        model: 'gpt-5.4-mini',
        generateRecipeImages: false,
        recipes: [
          {
            instructions: 'Make soup',
            context: {},
            safetyIdentifier: 'fixture',
            reasoningEffort: 'high',
          },
        ],
      });
      workload('recipe_generation', { model: 'gpt-5.4-mini', reasoningEffort: 'low' });
      personal('Changed queued style');
      policy({ executionMode, maxOutputTokens: 512, requestTimeoutSeconds: 15 });
      const submit = vi.fn(async (_input: { lines: string }) => {
        void _input;
        return { batchId: 'synthetic', inputFileId: 'file' };
      });
      setAiBatchClientForTests({
        submit,
        retrieve: vi.fn(),
        read: vi.fn(),
        cancel: vi.fn(),
        deleteFile: vi.fn(),
      });
      await runDueAiJobs();
      const request =
        executionMode === 'direct'
          ? serialized[0]
          : JSON.parse(submit.mock.calls[0]![0].lines.split('\n')[0]).body;
      expect(request).toMatchObject({
        model: 'gpt-5.4-mini',
        reasoning: { effort: 'high' },
        max_output_tokens: 512,
      });
      expect(request.instructions).toContain('Approved queued style');
      expect(request.instructions).not.toContain('Changed queued style');
      if (executionMode === 'direct') expect(requestOptions[0]?.timeout).toBeLessThanOrEqual(15000);
    },
  );
  it('freezes approved personal guidance for queued image Batch requests too', async () => {
    policy({ executionMode: 'batch' });
    personal('Approved image style');
    const recipe = createRecipe(draft, profileId);
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
    enqueueRecipeImageJob({
      profileId,
      threadId: null,
      images: [{ ...recipeImageInput(draft), recipeId: recipe.id }],
    });
    personal('Changed image style');
    const submit = vi.fn(async (_input: { lines: string }) => {
      void _input;
      return { batchId: 'synthetic', inputFileId: 'file' };
    });
    setAiBatchClientForTests({
      submit,
      retrieve: vi.fn(),
      read: vi.fn(),
      cancel: vi.fn(),
      deleteFile: vi.fn(),
    });
    await runDueAiJobs();
    expect(submit).toHaveBeenCalledOnce();
    const body = JSON.parse(submit.mock.calls[0]![0].lines.split('\n')[0]).body;
    expect(body.prompt).toContain('Approved image style');
    expect(body.prompt).not.toContain('Changed image style');
  });
  it('does not inject new personal instructions into a legacy queued recipe', async () => {
    policy({ executionMode: 'direct' });
    enqueueRecipeBatchGenerationJob({
      profileId,
      threadId: null,
      model: getAiWorkloadSetting(profileId, 'recipe_generation').model,
      generateRecipeImages: false,
      recipes: [
        {
          instructions: 'Make soup',
          context: {},
          safetyIdentifier: 'fixture',
          reasoningEffort: getAiWorkloadSetting(profileId, 'recipe_generation').reasoningEffort,
        },
      ],
    });
    const item = getDatabase().select().from(aiJobItems).get()!;
    const legacy = JSON.parse(item.payload);
    delete legacy.personalInstructions;
    getDatabase()
      .update(aiJobItems)
      .set({ payload: JSON.stringify(legacy) })
      .where(eq(aiJobItems.id, item.id))
      .run();
    personal('New unapproved queued style');
    await runDueAiJobs();
    expect(serialized).toHaveLength(1);
    expect(serialized[0].instructions).not.toContain('New unapproved queued style');
  });
  it('does not materialize a disabled workload', () => {
    workload('recipe_generation', { enabled: false });
    expect(() =>
      enqueueRecipeBatchGenerationJob({
        profileId,
        threadId: null,
        model: 'gpt-5.4-mini',
        generateRecipeImages: false,
        recipes: [
          {
            instructions: 'Make soup',
            context: {},
            safetyIdentifier: 'fixture',
            reasoningEffort: 'low',
          },
        ],
      }),
    ).toThrow(/disabled/);
    expect(getDatabase().select().from(aiJobs).all()).toHaveLength(0);
  });
});
