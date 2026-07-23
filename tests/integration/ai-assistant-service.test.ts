import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  aiActionPreviewImages,
  aiOperationAudits,
  mealPlanLeftoverLinks,
  recipeImages,
} from '@/lib/db/schema';
import { aiMealPlanCandidateSchema } from '@/lib/domain/ai-assistant';
import { recipeInputSchema } from '@/lib/domain/recipe';
import type {
  AiAssistantProvider,
  AssistantProviderResult,
} from '@/lib/providers/ai-assistant-provider';
import { setAiAssistantProviderForTests } from '@/lib/providers/ai-assistant-provider';
import type { AiProvider } from '@/lib/providers/ai-provider';
import { createAiActionProposal, decideAiAction } from '@/lib/services/ai-action-service';
import {
  generateAiActionPreviewImage,
  getAiActionPreviewImageFile,
} from '@/lib/services/ai-action-preview-image-service';
import {
  conciseProposalResponse,
  createAiChatThread,
  runAiChatTurn,
} from '@/lib/services/ai-chat-service';
import { buildAiProfileContext } from '@/lib/services/ai-context-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import { generateAiMealPlanProposal } from '@/lib/services/ai-meal-plan-service';
import {
  getAiDataPolicy,
  getAiSettings,
  updateAiSettings,
} from '@/lib/services/ai-settings-service';
import { completeSetup } from '@/lib/services/household-service';
import { addMealPlanEntryWithNutrition } from '@/lib/services/nutrition-planning-orchestration-service';
import { listPlannedMeals } from '@/lib/services/planning-service';
import { createRecipe, listRecipes } from '@/lib/services/recipe-service';

const recipe = recipeInputSchema.parse({
  title: 'Lemon chickpea bowls',
  summary: 'A bright weeknight bowl.',
  servings: '4 servings',
  prepMinutes: 15,
  cookMinutes: 20,
  sourceName: 'AI meal plan draft',
  sourceUrl: '',
  tags: ['weeknight'],
  ingredientGroups: [
    {
      name: 'Bowl',
      ingredients: [{ quantity: 2, unit: 'can', item: 'chickpeas', note: 'drained' }],
    },
  ],
  instructionSections: [{ title: 'Cook', steps: ['Warm the chickpeas and assemble the bowls.'] }],
});

class MockAssistantProvider implements AiAssistantProvider {
  responseQueue: AssistantProviderResult[] = [];
  mealPlanCandidate: unknown = null;
  async respond() {
    return (
      this.responseQueue.shift() ?? {
        text: 'Done.',
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        responseItems: [],
      }
    );
  }
  async generateMealPlan() {
    return aiMealPlanCandidateSchema.parse(
      this.mealPlanCandidate ?? {
        newRecipes: [{ key: 'chickpea-bowls', recipe }],
        entries: [
          {
            plannedFor: '2026-07-20',
            meal: 'dinner',
            existingRecipeId: null,
            newRecipeKey: 'chickpea-bowls',
            title: recipe.title,
            servings: 4,
            note: '',
          },
        ],
        warnings: ['Confirm dietary suitability.'],
        assumptions: [],
      },
    );
  }
  async generateRecipe() {
    return recipe;
  }
  async generateSummary() {
    return {
      headline: 'A steady day',
      body: 'Recorded totals were consistent.',
      highlights: [],
      caveats: ['Some values are estimates.'],
    };
  }
}

function setupProfile() {
  return completeSetup({
    householdName: 'Test kitchen',
    appName: 'Our Recipes',
    profile: {
      displayName: 'Maya',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
      mainGoals: 'Keep Sunday dinner relaxed and screen-free.',
      goalContext: {
        focusAreas: ['feel-healthier', 'organized-meals'],
        motivation: 'I want steadier energy and less stress around dinner.',
        challenges: 'I leave decisions until everyone is hungry.',
        successVision: 'Meals feel calm and I know what is coming next.',
      },
    },
  }).profiles[0]!;
}

describe('AI assistant services', () => {
  let provider: MockAssistantProvider;
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/ai-assistant');
    vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-at-least-32-characters');
    resetDatabaseForTests();
    provider = new MockAssistantProvider();
    setAiAssistantProviderForTests(provider);
  });
  afterEach(() => {
    setAiAssistantProviderForTests(null);
    setAiProviderForTests(null);
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('keeps a short preference-focused proposal response', () => {
    expect(
      conciseProposalResponse(
        'I made it high-protein and vegetarian like you requested.',
        'recipe_create',
      ),
    ).toBe('I made it high-protein and vegetarian like you requested.');
  });

  it('keeps reflective profile goals out of AI context until separately enabled', () => {
    const profile = setupProfile();
    expect(buildAiProfileContext(profile.id)[0]).not.toHaveProperty('profileGoals');

    const policy = getAiDataPolicy(profile.id);
    updateAiSettings(profile.id, {
      dataPolicy: { ...policy, shareProfileGoals: true },
    });

    expect(buildAiProfileContext(profile.id)[0]).toMatchObject({
      profileGoals: {
        focusAreas: ['feel-healthier', 'organized-meals'],
        motivation: 'I want steadier energy and less stress around dinner.',
        challenges: 'I leave decisions until everyone is hungry.',
        successVision: 'Meals feel calm and I know what is coming next.',
        additionalNotes: 'Keep Sunday dinner relaxed and screen-free.',
      },
    });
  });

  it('persists the household-wide recipe image generation switch', () => {
    const profile = setupProfile();
    const current = getAiSettings(profile.id);
    const imageSetting = current.workloads.find((item) => item.workload === 'image_generation')!;

    const updated = updateAiSettings(profile.id, {
      workloads: [{ ...imageSetting, enabled: false }],
    });

    expect(updated.workloads.find((item) => item.workload === 'image_generation')?.enabled).toBe(
      false,
    );
  });

  it('keeps chat writes as proposals and audits without raw message content', async () => {
    const profile = setupProfile();
    const thread = createAiChatThread(profile.id);
    provider.responseQueue.push(
      {
        text: '',
        usage: { inputTokens: 10, outputTokens: 3 },
        responseItems: [{ type: 'function_call' }],
        toolCalls: [
          {
            callId: 'call-1',
            name: 'prepare_recipe_change',
            arguments: {
              operation: 'create',
              recipeId: null,
              expectedRevision: null,
              recipeJson: JSON.stringify(recipe),
            },
          },
        ],
      },
      {
        text: [
          'I drafted a **Lemon chickpea bowls** recipe for review.',
          '',
          '- Makes 4 servings',
          '- About 15 minutes prep + 20 minutes cooking',
          '- Estimated per serving: **420 calories, 22 g protein**',
        ].join('\n'),
        usage: { inputTokens: 4, outputTokens: 5 },
        responseItems: [],
        toolCalls: [],
      },
    );
    const result = await runAiChatTurn({
      threadId: thread.id,
      profileId: profile.id,
      message: { message: 'My private family recipe phrase' },
    });
    expect(result.actions).toHaveLength(1);
    expect(result.message.content).toBe(
      'I created a recipe preview and kept your preferences in mind. Review it below when you’re ready.',
    );
    expect(result.message.content).not.toContain('servings');
    expect(listRecipes()).toHaveLength(0);
    const audit = getDatabase().select().from(aiOperationAudits).get()!;
    expect(audit.sourceLabel).toBe('Assistant chat turn');
    expect(JSON.stringify(audit)).not.toContain('private family recipe');
    const decided = await decideAiAction(result.actions[0]!.id, profile.id, 'confirm');
    expect(decided.status).toBe('confirmed');
    expect(listRecipes()).toHaveLength(1);
  });

  it('atomically saves generated recipes and their meal-plan entries only after confirmation', async () => {
    const profile = setupProfile();
    expect(getAiDataPolicy(profile.id).shareWeight).toBe(false);
    const generated = await generateAiMealPlanProposal({
      actorProfileId: profile.id,
      request: {
        startDate: '2026-07-20',
        endDate: '2026-07-20',
        mealSlots: ['dinner'],
        servings: 4,
        sourceMode: 'new',
        occupiedSlotMode: 'keep',
        instructions: '',
      },
    });
    expect(listRecipes()).toHaveLength(0);
    expect(listPlannedMeals('2026-07-20', '2026-07-20')).toHaveLength(0);
    await decideAiAction(generated.proposal.id, profile.id, 'confirm');
    expect(listRecipes()).toHaveLength(1);
    expect(listPlannedMeals('2026-07-20', '2026-07-20')).toMatchObject([
      { recipeTitle: 'Lemon chickpea bowls', meal: 'dinner' },
    ]);
  });

  it('builds a recipebook proposal without calling the AI provider', async () => {
    const profile = setupProfile();
    createRecipe(recipe, profile.id);
    const generate = vi.spyOn(provider, 'generateMealPlan');
    const proposed = await generateAiMealPlanProposal({
      actorProfileId: profile.id,
      request: {
        mode: 'recipebook',
        startDate: '2026-07-20',
        endDate: '2026-07-20',
        mealSlots: ['dinner'],
        servings: 1,
        sourceMode: 'existing',
        occupiedSlotMode: 'review',
        selectedProfileIds: [profile.id],
        options: {
          followNutrition: false,
          generateMissingRecipes: false,
          easyGroceryList: true,
          allowRepeatingMeals: false,
          planLeftovers: false,
        },
        fixedMeals: [],
        instructions: '',
      },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(proposed.proposal.preview).toMatchObject({
      request: { mode: 'recipebook' },
      candidate: { entries: [{ existingRecipeId: expect.any(String) }] },
    });
    await decideAiAction(proposed.proposal.id, profile.id, 'confirm');
    expect(listPlannedMeals('2026-07-20', '2026-07-20')).toMatchObject([
      { recipeTitle: 'Lemon chickpea bowls', servings: 1 },
    ]);
  });

  it('requires an explicit keep or replace choice for occupied slots', async () => {
    const profile = setupProfile();
    createRecipe(recipe, profile.id);
    const existing = addMealPlanEntryWithNutrition(
      {
        plannedFor: '2026-07-20',
        meal: 'dinner',
        recipeId: '',
        title: 'Existing supper',
        servings: 1,
        note: '',
      },
      profile.id,
    );
    const proposed = await generateAiMealPlanProposal({
      actorProfileId: profile.id,
      request: {
        mode: 'recipebook',
        startDate: '2026-07-20',
        endDate: '2026-07-20',
        mealSlots: ['dinner'],
        servings: 1,
        sourceMode: 'existing',
        occupiedSlotMode: 'review',
        selectedProfileIds: [profile.id],
        options: {
          followNutrition: false,
          generateMissingRecipes: false,
          easyGroceryList: true,
          allowRepeatingMeals: false,
          planLeftovers: false,
        },
        fixedMeals: [],
        instructions: '',
      },
    });
    await expect(decideAiAction(proposed.proposal.id, profile.id, 'confirm')).rejects.toThrow(
      'Choose keep or replace',
    );
    await decideAiAction(proposed.proposal.id, profile.id, 'confirm', [
      { entryId: existing.id, resolution: 'keep' },
    ]);
    expect(listPlannedMeals('2026-07-20', '2026-07-20')).toMatchObject([
      { recipeTitle: 'Existing supper' },
    ]);
  });

  it('links next-day lunch to an enlarged dinner without creating duplicate recipes', async () => {
    const profile = setupProfile();
    provider.mealPlanCandidate = {
      newRecipes: [{ key: 'chickpea-bowls', recipe }],
      entries: [
        {
          plannedFor: '2026-07-20',
          meal: 'dinner',
          existingRecipeId: null,
          newRecipeKey: 'chickpea-bowls',
          title: recipe.title,
          servings: 1,
          note: '',
        },
        {
          plannedFor: '2026-07-21',
          meal: 'lunch',
          existingRecipeId: null,
          newRecipeKey: 'chickpea-bowls',
          title: recipe.title,
          servings: 1,
          note: '',
        },
      ],
      warnings: [],
      assumptions: [],
    };
    const proposed = await generateAiMealPlanProposal({
      actorProfileId: profile.id,
      request: {
        mode: 'ai',
        startDate: '2026-07-20',
        endDate: '2026-07-21',
        mealSlots: ['lunch', 'dinner'],
        servings: 1,
        sourceMode: 'new',
        occupiedSlotMode: 'review',
        selectedProfileIds: [profile.id],
        options: {
          followNutrition: false,
          generateMissingRecipes: false,
          easyGroceryList: true,
          allowRepeatingMeals: false,
          planLeftovers: true,
        },
        fixedMeals: [],
        instructions: '',
      },
    });
    await decideAiAction(proposed.proposal.id, profile.id, 'confirm');
    expect(listRecipes()).toHaveLength(1);
    expect(listPlannedMeals('2026-07-20', '2026-07-21')).toMatchObject([
      { meal: 'dinner', servings: 2 },
      { meal: 'lunch', servings: 1, note: 'Leftovers from Lemon chickpea bowls' },
    ]);
    expect(getDatabase().select().from(mealPlanLeftoverLinks).all()).toMatchObject([
      { servings: 1, createdByProfileId: profile.id },
    ]);
  });

  it('confirms a batch of generated recipes atomically', async () => {
    const profile = setupProfile();
    const second = recipeInputSchema.parse({ ...recipe, title: 'Smoky bean bowls' });
    const action = createAiActionProposal({
      profileId: profile.id,
      kind: 'recipe_batch_create',
      payload: { recipes: [recipe, second] },
      preview: { operation: 'create recipe batch', recipes: [recipe, second] },
    });
    expect(listRecipes()).toHaveLength(0);
    await decideAiAction(action.id, profile.id, 'confirm');
    expect(
      listRecipes()
        .map((item) => item.title)
        .sort(),
    ).toEqual(['Lemon chickpea bowls', 'Smoky bean bowls']);
  });

  it('promotes a deterministic generated preview image when the recipe is confirmed', async () => {
    const profile = setupProfile();
    const thread = createAiChatThread(profile.id);
    const imageBytes = await sharp({
      create: { width: 48, height: 48, channels: 3, background: '#d8b88a' },
    })
      .png()
      .toBuffer();
    setAiProviderForTests({
      name: 'OpenAI',
      getStatus: () => ({
        provider: 'OpenAI',
        state: 'configured',
        enabled: true,
        message: 'Deterministic test provider.',
        supportedOperationKinds: ['image-generation'],
      }),
      generateRecipeImage: async () => ({
        bytes: imageBytes,
        altText: 'A deterministic bowl preview',
      }),
    } as unknown as AiProvider);
    const proposal = createAiActionProposal({
      threadId: thread.id,
      profileId: profile.id,
      kind: 'recipe_create',
      payload: { recipe },
      preview: { operation: 'create', recipe, image: { status: 'generating' } },
    });

    const preview = await generateAiActionPreviewImage({
      actionId: proposal.id,
      profileId: profile.id,
      recipe,
    });
    expect(preview.preview).toMatchObject({ image: { status: 'ready' } });
    expect(
      (await getAiActionPreviewImageFile(proposal.id, profile.id))?.data.byteLength,
    ).toBeGreaterThan(0);
    expect(getDatabase().select().from(aiActionPreviewImages).all()).toHaveLength(1);

    const confirmed = await decideAiAction(proposal.id, profile.id, 'confirm');
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      result: { recipeId: expect.any(String) },
    });
    expect(getDatabase().select().from(aiActionPreviewImages).all()).toHaveLength(0);
    expect(getDatabase().select().from(recipeImages).all()).toMatchObject([
      { altText: 'A deterministic bowl preview', createdByProfileId: profile.id },
    ]);
  });

  it('generates and attaches requested meal-plan recipe images only on confirmation', async () => {
    const profile = setupProfile();
    const imageBytes = await sharp({
      create: { width: 48, height: 48, channels: 3, background: '#8aa06b' },
    })
      .png()
      .toBuffer();
    setAiProviderForTests({
      name: 'OpenAI',
      getStatus: () => ({
        provider: 'OpenAI',
        state: 'configured',
        enabled: true,
        message: 'Deterministic test provider.',
        supportedOperationKinds: ['image-generation'],
      }),
      generateRecipeImage: async () => ({
        bytes: imageBytes,
        altText: 'A deterministic meal-plan image',
      }),
    } as unknown as AiProvider);

    const generated = await generateAiMealPlanProposal({
      actorProfileId: profile.id,
      request: {
        mode: 'ai',
        startDate: '2026-07-20',
        endDate: '2026-07-20',
        mealSlots: ['dinner'],
        servings: 1,
        sourceMode: 'new',
        occupiedSlotMode: 'review',
        selectedProfileIds: [profile.id],
        options: {
          followNutrition: false,
          generateMissingRecipes: false,
          easyGroceryList: true,
          allowRepeatingMeals: false,
          planLeftovers: false,
          generateRecipeImages: true,
        },
        fixedMeals: [],
        instructions: '',
      },
    });

    expect(getDatabase().select().from(recipeImages).all()).toHaveLength(0);
    await decideAiAction(generated.proposal.id, profile.id, 'confirm');
    expect(getDatabase().select().from(recipeImages).all()).toMatchObject([
      { altText: 'A deterministic meal-plan image', createdByProfileId: profile.id },
    ]);
  });
});
