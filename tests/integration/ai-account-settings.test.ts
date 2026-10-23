import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSqliteDatabase } from '@/lib/db/client';
import { taskPreferences } from '@/lib/db/schema';
import { taskSettingsSchema } from '@/lib/domain/task-settings';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { listRecipes } from '@/lib/services/recipe-service';
import { createAiChatThread, runAiChatTurn } from '@/lib/services/ai-chat-service';
import { getAiActionProposal } from '@/lib/services/ai-action-service';
import {
  setAiAssistantProviderForTests,
  type AiAssistantProvider,
} from '@/lib/providers/ai-assistant-provider';
const capture = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/capture-service', () => ({ capturePublicUrl: capture }));
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { user, profileAuthLinks, aiJobItems, aiJobs } from '@/lib/db/schema';
import { completeSetup, addProfile } from '@/lib/services/household-service';
import {
  getGlobalAiSettings,
  saveGlobalAiSettings,
  getPersonalAiSettings,
  savePersonalAiSettings,
  getAiWorkloadSetting,
} from '@/lib/services/ai-settings-service';
import { canAccountUseAi, getEffectiveAiPolicy } from '@/lib/services/ai-access-service';
import { assertAiRateLimit, resetAiRateLimitsForTests } from '@/lib/services/ai-operation-service';
import { taskExecutionMode } from '@/lib/services/task-settings-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import type { AiProvider } from '@/lib/providers/ai-provider';
import { importAiRecipeSet } from '@/lib/services/ai-bulk-import-service';
import { getAiJob, runDueAiJobs, setAiBatchClientForTests } from '@/lib/services/ai-job-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
vi.mock('server-only', () => ({}));
const profileInput = {
  displayName: 'Alex',
  color: '#637A45',
  avatarUrl: '',
  units: 'metric' as const,
  temperatureUnit: 'C' as const,
  locale: 'en-GB',
  timezone: 'Europe/London',
};
function account(
  profileId: string,
  role: 'admin' | 'parent' | 'child' = 'parent',
): RequestPrincipal {
  const id = randomUUID();
  const now = new Date();
  getDatabase()
    .insert(user)
    .values({ id, name: role, email: `${id}@example.test`, role, createdAt: now, updatedAt: now })
    .run();
  getDatabase()
    .insert(profileAuthLinks)
    .values({ profileId, userId: id, createdAt: now, updatedAt: now })
    .run();
  return {
    userId: id,
    linkedProfileId: profileId,
    profileId,
    role,
    accountRole: role,
    activeProfileRole: role,
    kind: 'session',
    sessionId: 'test',
    apiKeyId: null,
  };
}
function setup() {
  const state = completeSetup({
    householdName: 'AI controls',
    appName: 'Bord',
    profile: profileInput,
  });
  return account(state.profiles[0]!.id, 'admin');
}
function changeGlobal(
  principal: RequestPrincipal,
  changes: Record<string, unknown> = {},
  disabled?: string,
) {
  const global = getGlobalAiSettings(principal.profileId);
  return saveGlobalAiSettings(principal.profileId, {
    settings: { ...global.settings, ...changes },
    version: global.version,
    workloads: global.workloads,
    users: global.users.map((row) => ({
      id: row.id,
      enabled: row.id === disabled ? false : row.enabled,
      version: row.version,
    })),
  });
}
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  resetDatabaseForTests();
  resetAiRateLimitsForTests();
});
afterEach(() => {
  setAiProviderForTests(null);
  setAiAssistantProviderForTests(null);
  capture.mockReset();
  setAiBatchClientForTests(null);
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
describe('account AI policies', () => {
  it('fails closed for missing accounts and orphaned jobs outside the test harness', () => {
    const principal = setup();
    expect(canAccountUseAi('missing-account')).toBe(false);
    getDatabase()
      .delete(profileAuthLinks)
      .where(eq(profileAuthLinks.profileId, principal.profileId))
      .run();
    vi.stubEnv('NODE_ENV', 'development');
    expect(getEffectiveAiPolicy(principal.profileId).enabled).toBe(false);
  });
  it('defaults to 10 actions per ten minutes and batches a pair of recipes', () => {
    const principal = setup();
    expect(getEffectiveAiPolicy(principal.profileId)).toMatchObject({
      generationsPerTenMinutes: 10,
      executionMode: 'auto',
      batchMinItems: 2,
    });
    for (let index = 0; index < 10; index++) assertAiRateLimit(principal.profileId, 1000);
    expect(() => assertAiRateLimit(principal.profileId, 1000)).toThrow('10 AI actions');
    expect(() => assertAiRateLimit(principal.profileId, 601001)).not.toThrow();
    expect(taskExecutionMode(principal.profileId, 2)).toBe('batch');
  });
  it('inherits global changes, isolates account models and never bypasses a disabled task', () => {
    const principal = setup();
    const other = account(addProfile({ ...profileInput, displayName: 'Other' }).id);
    const personal = getPersonalAiSettings(other.userId, other.profileId);
    const recipe = personal.workloads.find((row) => row.workload === 'recipe_generation')!;
    savePersonalAiSettings(other.userId, other.profileId, {
      version: personal.account.version,
      preferences: {
        processing: { executionMode: 'direct', batchMinItems: 3 },
        workloads: [{ ...recipe, model: 'gpt-4o', reasoningEffort: null }],
      },
    });
    expect(getAiWorkloadSetting(other.profileId, 'recipe_generation').model).toBe('gpt-4o');
    expect(getAiWorkloadSetting(principal.profileId, 'recipe_generation').model).toBe(recipe.model);
    expect(taskExecutionMode(other.profileId, 12)).toBe('direct');
    const global = getGlobalAiSettings(principal.profileId);
    saveGlobalAiSettings(principal.profileId, {
      settings: global.settings,
      version: global.version,
      users: [],
      workloads: global.workloads.map((row) =>
        row.workload === 'recipe_generation' ? { ...row, enabled: false } : row,
      ),
    });
    expect(getAiWorkloadSetting(other.profileId, 'recipe_generation').enabled).toBe(false);
  });
  it('administrator access cannot be enabled by a personal update, including stale updates', () => {
    const principal = setup();
    const before = getPersonalAiSettings(principal.userId, principal.profileId);
    changeGlobal(principal, {}, principal.userId);
    expect(canAccountUseAi(principal.userId)).toBe(false);
    expect(() =>
      savePersonalAiSettings(principal.userId, principal.profileId, {
        version: before.account.version,
        preferences: {},
      }),
    ).toThrow('changed');
    const fresh = getPersonalAiSettings(principal.userId, principal.profileId);
    savePersonalAiSettings(principal.userId, principal.profileId, {
      version: fresh.account.version,
      preferences: {},
    });
    expect(canAccountUseAi(principal.userId)).toBe(false);
    expect(() => assertAiRateLimit(principal.profileId)).toThrow('disabled');
  });
  it('keeps child AI disabled until explicitly granted and supports global disabling', () => {
    const admin = setup();
    const child = account(addProfile({ ...profileInput, displayName: 'Child' }).id, 'child');
    expect(canAccountUseAi(child.userId)).toBe(false);
    const global = getGlobalAiSettings(admin.profileId);
    saveGlobalAiSettings(admin.profileId, {
      settings: global.settings,
      version: global.version,
      users: [{ id: child.userId, enabled: true, version: 0 }],
    });
    expect(canAccountUseAi(child.userId)).toBe(true);
    changeGlobal(admin, { enabled: false });
    expect(canAccountUseAi(child.userId)).toBe(false);
  });
  it('queues independently labelled image and prompt drafts without a live provider request', async () => {
    const principal = setup();
    setAiProviderForTests({ getStatus: () => ({ enabled: true }) } as AiProvider);
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#637a45' },
    })
      .png()
      .toBuffer();
    const job = await importAiRecipeSet(principal, {
      confirmPaid: true,
      sources: [
        { kind: 'prompt', text: 'A quick bean soup' },
        {
          kind: 'image',
          name: 'Recipe photo.png',
          image: { mimeType: 'image/png', dataBase64: image.toString('base64') },
        },
      ],
    });
    expect(job).toMatchObject({ executionMode: 'batch', totalItems: 2 });
    expect(job.items.map((item) => item.label)).toEqual(['A quick bean soup', 'Recipe photo.png']);
    const queued = getDatabase()
      .select()
      .from(aiJobItems)
      .where(eq(aiJobItems.jobId, job.id))
      .all();
    expect(JSON.parse(queued[1]!.payload).images[0].mimeType).toBe('image/jpeg');
    const submit = vi.fn().mockResolvedValue({ batchId: 'mock-batch', inputFileId: 'mock-file' });
    setAiBatchClientForTests({
      submit,
      retrieve: vi.fn(),
      read: vi.fn(),
      cancel: vi.fn(),
      deleteFile: vi.fn(),
    });
    await runDueAiJobs();
    const lines = JSON.parse(submit.mock.calls[0]![0].lines.split('\n')[1]);
    expect(lines.body.input[0].content[1].type).toBe('input_image');
    expect(lines.body.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/u);
  });
  it('fails queued work after access is revoked without submitting a paid batch', async () => {
    const principal = setup();
    setAiProviderForTests({ getStatus: () => ({ enabled: true }) } as AiProvider);
    const job = await importAiRecipeSet(principal, {
      confirmPaid: true,
      sources: [
        { kind: 'prompt', text: 'Soup' },
        { kind: 'prompt', text: 'Bread' },
      ],
    });
    changeGlobal(principal, {}, principal.userId);
    const submit = vi.fn();
    setAiBatchClientForTests({
      submit,
      retrieve: vi.fn(),
      read: vi.fn(),
      cancel: vi.fn(),
      deleteFile: vi.fn(),
    });
    await runDueAiJobs();
    expect(submit).not.toHaveBeenCalled();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.status).toBe(
      'failed',
    );
  });
  it('does not transfer queued AI permission when a profile is relinked to another account', async () => {
    const principal = setup();
    setAiProviderForTests({ getStatus: () => ({ enabled: true }) } as AiProvider);
    const job = await importAiRecipeSet(principal, {
      confirmPaid: true,
      sources: [
        { kind: 'prompt', text: 'Soup' },
        { kind: 'prompt', text: 'Bread' },
      ],
    });
    changeGlobal(principal, {}, principal.userId);
    const other = account(addProfile({ ...profileInput, displayName: 'Replacement' }).id);
    getDatabase()
      .delete(profileAuthLinks)
      .where(eq(profileAuthLinks.profileId, other.profileId))
      .run();
    getDatabase()
      .update(profileAuthLinks)
      .set({ userId: other.userId })
      .where(eq(profileAuthLinks.profileId, principal.profileId))
      .run();
    expect(getEffectiveAiPolicy(principal.profileId).enabled).toBe(true);
    expect(() => getAiJob(job.id, principal.profileId, other.userId)).toThrow('another account');
    const submit = vi.fn();
    setAiBatchClientForTests({
      submit,
      retrieve: vi.fn(),
      read: vi.fn(),
      cancel: vi.fn(),
      deleteFile: vi.fn(),
    });
    await runDueAiJobs();
    expect(submit).not.toHaveBeenCalled();
    expect(getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()?.errorCode).toBe(
      'ai_disabled',
    );
  });
  it('rejects unconfirmed or invalid images and unrelated profiles before enqueueing', async () => {
    const principal = setup();
    setAiProviderForTests({ getStatus: () => ({ enabled: true }) } as AiProvider);
    const sources = [
      { kind: 'prompt', text: 'Soup' },
      { kind: 'prompt', text: 'Bread' },
    ];
    await expect(importAiRecipeSet(principal, { confirmPaid: false, sources })).rejects.toThrow();
    await expect(
      importAiRecipeSet({ ...principal, profileId: randomUUID() }, { confirmPaid: true, sources }),
    ).rejects.toThrow('own profile');
    await expect(
      importAiRecipeSet(principal, {
        confirmPaid: true,
        sources: [
          sources[0],
          {
            kind: 'image',
            name: 'broken.jpg',
            image: { mimeType: 'image/jpeg', dataBase64: 'bm90IGFuIGltYWdl' },
          },
        ],
      }),
    ).rejects.toThrow('Could not read image');
    expect(getDatabase().select().from(aiJobs).all()).toHaveLength(0);
  });
});

describe('bulk import results and upgrade compatibility', () => {
  it('preserves legacy automation choices and shared models during a schema upgrade', async () => {
    const principal = setup();
    const previous = getGlobalAiSettings(principal.profileId);
    const legacySettings = taskSettingsSchema.parse({ executionMode: 'direct', batchMinItems: 7 });
    getDatabase()
      .insert(taskPreferences)
      .values({
        profileId: principal.profileId,
        userId: principal.userId,
        settings: JSON.stringify(legacySettings),
        version: 1,
        updatedAt: new Date(),
      })
      .run();
    const directory = mkdtempSync(join(tmpdir(), 'bord-ai-upgrade-'));
    const path = join(directory, 'legacy.db');
    try {
      await getSqliteDatabase().backup(path);
      const legacy = new Database(path);
      legacy.exec(
        'ALTER TABLE ai_chat_threads DROP COLUMN privacy_scope_json; DROP TABLE kitchen_accepted_plans; DROP TABLE cooking_episode_operations; ALTER TABLE cook_sessions DROP COLUMN cooking_restrictions; ALTER TABLE cook_sessions DROP COLUMN context_revision; DROP TABLE cooking_session_changes; ALTER TABLE cook_sessions DROP COLUMN owner_user_id; ALTER TABLE cook_sessions DROP COLUMN effective_recipe; ALTER TABLE cook_sessions DROP COLUMN effective_revision; DROP TABLE kitchen_resource_claims; DROP TABLE kitchen_physical_uses; DROP TABLE kitchen_operations; DROP TABLE kitchen_equipment; DROP TABLE kitchens; ALTER TABLE ai_profile_settings DROP COLUMN share_kitchen_equipment; ALTER TABLE recipes DROP COLUMN equipment_requirements; DROP TABLE ai_execution_traces; ALTER TABLE ai_action_preview_images DROP COLUMN source_digest; ALTER TABLE ai_action_preview_images DROP COLUMN owner_user_id; ALTER TABLE ai_action_proposals DROP COLUMN turn_id; ALTER TABLE ai_jobs DROP COLUMN turn_id; ALTER TABLE ai_decision_records DROP COLUMN turn_id; ALTER TABLE shopping_list_items DROP COLUMN cart_unit; DROP TABLE ai_prompt_versions; DROP TABLE recipe_image_candidates; DROP TABLE ai_chat_turns; ALTER TABLE ai_operation_audits DROP COLUMN prompt_version; DROP TABLE ai_user_settings; DROP TABLE ai_runtime_settings; DELETE FROM __drizzle_migrations WHERE created_at >= 1792281600001;',
      );
      legacy.close();
      resetDatabaseForTests();
      vi.stubEnv('DATABASE_URL', path);
      expect(getEffectiveAiPolicy(principal.profileId)).toMatchObject({
        executionMode: 'direct',
        batchMinItems: 7,
        generationsPerTenMinutes: 10,
      });
      expect(getGlobalAiSettings(principal.profileId).workloads).toEqual(previous.workloads);
      expect(getSqliteDatabase().pragma('foreign_key_check')).toEqual([]);
    } finally {
      resetDatabaseForTests();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('chat queues multiple URL imports in one batch and recovers review-only drafts without another chat turn', async () => {
    const principal = setup();
    setAiProviderForTests({ getStatus: () => ({ enabled: true }) } as AiProvider);
    capture.mockResolvedValue({
      draft: { originalText: 'Recipe: soup, one onion, simmer for 20 minutes.' },
    });
    const thread = createAiChatThread(principal.profileId);
    const respond = vi
      .fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            callId: 'bulk-import',
            name: 'import_recipes',
            arguments: {
              sources: [
                { kind: 'url', value: 'https://recipes.example.test/soup', attachmentIndex: null },
                { kind: 'url', value: 'https://recipes.example.test/bread', attachmentIndex: null },
              ],
            },
          },
        ],
        responseItems: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      })
      .mockResolvedValue({
        text: 'Your recipes are queued for review.',
        toolCalls: [],
        responseItems: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      });
    setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
    const turn = await runAiChatTurn({
      principal,
      profileId: principal.profileId,
      threadId: thread.id,
      message: { message: 'Import these two recipe links for me' },
    });
    expect(turn.jobs).toHaveLength(1);
    const job = turn.jobs[0]!;
    expect(job.executionMode).toBe('batch');
    expect(capture).toHaveBeenCalledTimes(2);
    let output = '';
    const recipe = recipeInputSchema.parse({
      title: 'Imported soup',
      summary: '',
      prepMinutes: 0,
      cookMinutes: 20,
      sourceName: '',
      sourceUrl: '',
      tags: [],
      servings: '2 servings',
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 1, unit: '', item: 'onion', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer for 20 minutes.'] }],
    });
    setAiBatchClientForTests({
      submit: async ({ lines }) => {
        output = lines
          .split('\n')
          .map((line) => ({
            custom_id: JSON.parse(line).custom_id,
            response: { status_code: 200, body: { output_text: JSON.stringify(recipe) } },
          }))
          .map((row) => JSON.stringify(row))
          .join('\n');
        return { batchId: 'mock-import-batch', inputFileId: 'mock-input' };
      },
      retrieve: async () => ({
        id: 'mock-import-batch',
        status: 'completed',
        inputFileId: 'mock-input',
        outputFileId: 'mock-output',
      }),
      read: async () => output,
      cancel: async () => {},
      deleteFile: async () => {},
    });
    await runDueAiJobs();
    getDatabase()
      .update(aiJobs)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(aiJobs.id, job.id))
      .run();
    await runDueAiJobs();
    const finished = getDatabase().select().from(aiJobs).where(eq(aiJobs.id, job.id)).get()!;
    expect(finished.status).toBe('completed');
    expect(finished.actionId).toBeTruthy();
    expect(getAiActionProposal(finished.actionId!, principal.profileId).action.kind).toBe(
      'recipe_batch_create',
    );
    expect(listRecipes()).toHaveLength(0);
  });
});

describe('schedule editing scope', () => {
  it('does not overwrite a newer personal processing choice from a stale schedule form', async () => {
    const principal = setup();
    const { getTaskSettings, saveTaskSettings } =
      await import('@/lib/services/task-settings-service');
    const stale = getTaskSettings(principal.linkedProfileId);
    const personal = getPersonalAiSettings(principal.userId, principal.linkedProfileId);
    savePersonalAiSettings(principal.userId, principal.linkedProfileId, {
      version: personal.account.version,
      preferences: {
        ...personal.account.preferences,
        processing: { executionMode: 'direct', batchMinItems: 7 },
      },
    });
    const result = saveTaskSettings(principal, { ...stale.settings, hour: 13 }, stale.version);
    expect(getEffectiveAiPolicy(principal.linkedProfileId)).toMatchObject({
      executionMode: 'direct',
      batchMinItems: 7,
    });
    expect(result.settings).toMatchObject({ hour: 13, executionMode: 'direct', batchMinItems: 7 });
    expect(() => saveTaskSettings(principal, stale.settings, stale.version)).toThrow('changed');
  });
});
