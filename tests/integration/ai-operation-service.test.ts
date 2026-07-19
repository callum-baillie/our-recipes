import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getActorContext } from '@/lib/actor-context';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { aiOperationAudits } from '@/lib/db/schema';
import {
  aiNutritionEstimateSchema,
  aiRecipeCandidateSchema,
  type AiConnectionStatus,
  type AiNutritionEstimate,
  type AiRecipeCandidate,
} from '@/lib/domain/ai';
import type {
  AiGeneratedImage,
  AiImageGenerationInput,
  AiNutritionEstimationInput,
  AiProvider,
  AiRecipeImprovementInput,
  AiTextReviewInput,
  AiVisionReviewInput,
} from '@/lib/providers/ai-provider';
import {
  createAiReviewCandidate,
  estimateAiRecipeNutrition,
  generateAiRecipeImage,
  improveAiRecipe,
  resetAiRateLimitsForTests,
} from '@/lib/services/ai-operation-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import { completeSetup } from '@/lib/services/household-service';
import { createImportOperation } from '@/lib/services/import-service';
import {
  createRecipe,
  getRecipe,
  recipePayloadFromDetail,
  RecipeConflictError,
} from '@/lib/services/recipe-service';

const candidate: AiRecipeCandidate = aiRecipeCandidateSchema.parse({
  recipe: {
    title: 'Suggested tomato soup',
    summary: '',
    servings: '4 bowls',
    prepMinutes: 5,
    cookMinutes: 20,
    sourceName: '',
    sourceUrl: '',
    tags: [],
    ingredientGroups: [
      { name: '', ingredients: [{ quantity: '', unit: '', item: 'tomatoes', note: '' }] },
    ],
    instructionSections: [{ title: '', steps: ['Simmer until fragrant.'] }],
  },
  confidence: 0.6,
  warnings: ['Confirm quantities before saving.'],
  uncertainSegments: [],
});

const nutritionEstimate: AiNutritionEstimate = aiNutritionEstimateSchema.parse({
  servings: '4 servings',
  nutritionCalories: 230,
  nutritionProteinGrams: 5,
  nutritionCarbohydrateGrams: 22,
  nutritionFatGrams: 14,
  nutritionSaturatedFatGrams: 3,
  nutritionFiberGrams: 6,
  nutritionSugarGrams: 9,
  nutritionSodiumMilligrams: 410,
  confidence: 0.7,
  warnings: ['AI-generated estimate; review before relying on it.'],
});

class DeterministicAiProvider implements AiProvider {
  readonly name = 'OpenAI' as const;
  readonly visionInputs: AiVisionReviewInput[] = [];
  readonly textInputs: AiTextReviewInput[] = [];
  readonly imageInputs: AiImageGenerationInput[] = [];
  readonly nutritionInputs: AiNutritionEstimationInput[] = [];
  readonly improvementInputs: AiRecipeImprovementInput[] = [];

  getStatus(): AiConnectionStatus {
    return {
      provider: 'OpenAI',
      state: 'configured',
      enabled: true,
      message: 'Test provider is configured.',
      supportedOperationKinds: [
        'text-normalization',
        'vision-extraction',
        'image-generation',
        'nutrition-estimation',
        'recipe-improvement',
      ],
    };
  }

  async createTextReviewCandidate(input: AiTextReviewInput): Promise<AiRecipeCandidate> {
    this.textInputs.push(input);
    return candidate;
  }

  async createVisionReviewCandidate(input: AiVisionReviewInput): Promise<AiRecipeCandidate> {
    this.visionInputs.push(input);
    return candidate;
  }

  async generateRecipeImage(input: AiImageGenerationInput): Promise<AiGeneratedImage> {
    this.imageInputs.push(input);
    return {
      bytes: await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#a64228' },
      })
        .webp()
        .toBuffer(),
      altText: `AI-generated serving image for ${input.recipeTitle}`,
    };
  }

  async estimateRecipeNutrition(input: AiNutritionEstimationInput): Promise<AiNutritionEstimate> {
    this.nutritionInputs.push(input);
    return nutritionEstimate;
  }

  async improveRecipe(input: AiRecipeImprovementInput): Promise<AiRecipeCandidate> {
    this.improvementInputs.push(input);
    return candidate;
  }
}

function createProfile() {
  return completeSetup({
    householdName: 'Sunday suppers',
    appName: 'Our Recipes',
    profile: {
      displayName: 'Maya',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
    },
  }).profiles[0]!;
}

describe('review-first AI operation service', () => {
  let provider: DeterministicAiProvider;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/ai');
    resetDatabaseForTests();
    resetAiRateLimitsForTests();
    provider = new DeterministicAiProvider();
    setAiProviderForTests(provider);
  });

  afterEach(() => {
    setAiProviderForTests(null);
    resetAiRateLimitsForTests();
    resetDatabaseForTests();
    rmSync(resolve(process.cwd(), '.test-data/ai'), { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('uses only explicit bounded sources, preserves review-first behavior, and audits without raw content', async () => {
    const profile = createProfile();
    const sourceText =
      'Private handwritten tomato soup notes. Ingredients: tomatoes. Simmer gently.';
    const textReview = await createAiReviewCandidate({
      actorProfileId: profile.id,
      action: {
        confirm: true,
        kind: 'text-normalization',
        sourceText,
        sourceLabel: 'Maya’s notebook',
        improve: false,
      },
    });
    expect(textReview.candidate.recipe.sourceName).toBe('Maya’s notebook');
    expect(provider.textInputs).toHaveLength(1);

    const scan = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#f5ecd6' },
    })
      .png()
      .toBuffer();
    const imported = await createImportOperation({
      actorProfileId: profile.id,
      sourceName: 'tomato-notes.png',
      bytes: scan,
      autoOpenAiVision: true,
    });
    expect(imported.operation.extractionMethod).toBe('openai-vision-pending');
    const visionReview = await createAiReviewCandidate({
      actorProfileId: profile.id,
      action: {
        confirm: true,
        kind: 'vision-extraction',
        importId: imported.operation.id,
        improve: false,
      },
    });
    expect(visionReview.candidate.recipe.sourceName).toBe('tomato-notes.png');
    expect(provider.visionInputs[0]?.imageDataUrls[0]).toMatch(/^data:image\/webp;base64,/u);

    const recipe = createRecipe(
      {
        title: 'Tomato soup',
        summary: 'A quick tomato soup.',
        servings: 'unknown',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: '', unit: '', item: 'tomatoes', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Simmer gently.'] }],
      },
      profile.id,
    );
    const estimated = await estimateAiRecipeNutrition({
      actorProfileId: profile.id,
      recipeId: recipe.id,
      expectedRevision: recipe.currentRevision,
    });
    expect(provider.nutritionInputs[0]).toMatchObject({
      servings: 'unknown',
      ingredientGroups: [{ ingredients: [expect.objectContaining({ item: 'tomatoes' })] }],
    });
    expect(estimated.recipe.currentRevision).toBe(2);
    expect(estimated.recipe.servings).toBe('4 servings');
    expect(estimated.recipe.nutritionCalories).toBe(230);
    expect(estimated.recipe.nutritionSodiumMilligrams).toBe(410);

    const generated = await generateAiRecipeImage({
      actorProfileId: profile.id,
      recipeId: recipe.id,
    });
    expect(getRecipe(recipe.id)?.images.map((image) => image.id)).toContain(generated.imageId);
    expect(provider.imageInputs[0]?.recipeTitle).toBe('Tomato soup');

    const audits = getDatabase().select().from(aiOperationAudits).all();
    expect(audits).toHaveLength(4);
    expect(audits.map((audit) => audit.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect(audits.map((audit) => audit.sourceDigest)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/u)]),
    );
    expect(audits.find((audit) => audit.kind === 'image-generation')?.generatedImageId).toBe(
      generated.imageId,
    );
    expect(audits.find((audit) => audit.kind === 'nutrition-estimation')?.recipeId).toBe(recipe.id);
    expect(JSON.stringify(audits)).not.toContain(sourceText);
  });

  it('uses the visible default profile when a browser has no valid selection cookie', () => {
    const profile = createProfile();

    expect(getActorContext(undefined)).toEqual({
      profileId: profile.id,
      source: 'profile-default',
    });
    expect(getActorContext('invalid-cookie')).toEqual({
      profileId: profile.id,
      source: 'profile-default',
    });
  });

  it('rejects a stale recipe revision before making a paid provider request', async () => {
    const profile = createProfile();
    const recipe = createRecipe(
      {
        title: 'Stale soup card',
        summary: '',
        servings: '4 servings',
        prepMinutes: 0,
        cookMinutes: 15,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 2, unit: '', item: 'tomatoes', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Simmer gently.'] }],
      },
      profile.id,
    );

    await expect(
      estimateAiRecipeNutrition({
        actorProfileId: profile.id,
        recipeId: recipe.id,
        expectedRevision: recipe.currentRevision + 1,
      }),
    ).rejects.toBeInstanceOf(RecipeConflictError);
    expect(provider.nutritionInputs).toHaveLength(0);
    expect(getDatabase().select().from(aiOperationAudits).all()).toHaveLength(0);
  });

  it('improves recipe prose and metadata while preserving the submitted ingredients', async () => {
    const profile = createProfile();
    const recipe = createRecipe(
      {
        title: 'Carot soop',
        summary: '',
        servings: 'unknown',
        prepMinutes: 0,
        cookMinutes: 15,
        sourceName: 'Image Import (Normalized by OpenAI)',
        sourceUrl: '',
        tags: ['family'],
        ingredientGroups: [
          {
            name: '',
            ingredients: [{ quantity: 4, unit: '', item: 'carrots', note: 'chopped' }],
          },
        ],
        instructionSections: [{ title: '', steps: ['Cook it.'] }],
      },
      profile.id,
    );

    const submitted = recipePayloadFromDetail(recipe);
    const result = await improveAiRecipe({
      actorProfileId: profile.id,
      recipeId: recipe.id,
      expectedRevision: recipe.currentRevision,
      recipe: submitted,
    });

    expect(provider.improvementInputs).toEqual([{ recipe: submitted }]);
    expect(result.candidate.recipe.ingredientGroups).toEqual(submitted.ingredientGroups);
    expect(result.candidate.recipe.instructionSections).toEqual(
      candidate.recipe.instructionSections,
    );
    expect(result.candidate.recipe.sourceName).toBe('Image Import (Normalized by OpenAI)');
    expect(result.candidate.recipe.tags).toEqual(candidate.recipe.tags);
    expect(getRecipe(recipe.id)?.currentRevision).toBe(1);

    const audit = getDatabase().select().from(aiOperationAudits).all()[0];
    expect(audit).toMatchObject({
      kind: 'recipe-improvement',
      status: 'succeeded',
      recipeId: recipe.id,
    });
  });
});
