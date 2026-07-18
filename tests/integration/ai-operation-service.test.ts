import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { aiOperationAudits } from '@/lib/db/schema';
import {
  aiRecipeCandidateSchema,
  type AiConnectionStatus,
  type AiRecipeCandidate,
} from '@/lib/domain/ai';
import type {
  AiGeneratedImage,
  AiImageGenerationInput,
  AiProvider,
  AiTextReviewInput,
  AiVisionReviewInput,
} from '@/lib/providers/ai-provider';
import {
  createAiReviewCandidate,
  generateAiRecipeImage,
  resetAiRateLimitsForTests,
} from '@/lib/services/ai-operation-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import { completeSetup } from '@/lib/services/household-service';
import { createImportOperation } from '@/lib/services/import-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';

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

class DeterministicAiProvider implements AiProvider {
  readonly name = 'OpenAI' as const;
  readonly visionInputs: AiVisionReviewInput[] = [];
  readonly textInputs: AiTextReviewInput[] = [];
  readonly imageInputs: AiImageGenerationInput[] = [];

  getStatus(): AiConnectionStatus {
    return {
      provider: 'OpenAI',
      state: 'configured',
      enabled: true,
      message: 'Test provider is configured.',
      supportedOperationKinds: ['text-normalization', 'vision-extraction', 'image-generation'],
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
      action: { confirm: true, kind: 'vision-extraction', importId: imported.operation.id },
    });
    expect(visionReview.candidate.recipe.sourceName).toBe('tomato-notes.png');
    expect(provider.visionInputs[0]?.imageDataUrls[0]).toMatch(/^data:image\/webp;base64,/u);

    const recipe = createRecipe(
      {
        title: 'Tomato soup',
        summary: 'A quick tomato soup.',
        servings: '4 bowls',
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
    const generated = await generateAiRecipeImage({
      actorProfileId: profile.id,
      recipeId: recipe.id,
    });
    expect(getRecipe(recipe.id)?.images.map((image) => image.id)).toContain(generated.imageId);
    expect(provider.imageInputs[0]?.recipeTitle).toBe('Tomato soup');

    const audits = getDatabase().select().from(aiOperationAudits).all();
    expect(audits).toHaveLength(3);
    expect(audits.map((audit) => audit.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    expect(audits.map((audit) => audit.sourceDigest)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/u)]),
    );
    expect(audits.find((audit) => audit.kind === 'image-generation')?.generatedImageId).toBe(
      generated.imageId,
    );
    expect(JSON.stringify(audits)).not.toContain(sourceText);
  });
});
