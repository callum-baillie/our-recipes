import { describe, expect, it, vi } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';

vi.mock('server-only', () => ({}));

import {
  aiNutritionEstimateSchema,
  aiRecipeCandidateStructuredOutputSchema,
  aiRecipeCandidateSchema,
  aiReviewRequestSchema,
  type AiConnectionStatus,
  type AiNutritionEstimate,
  type AiRecipeCandidate,
} from '@/lib/domain/ai';
import { normalizeAiRecipeCandidate } from '@/lib/domain/ai-candidate-normalization';
import {
  AiProviderUnavailableError,
  OpenAiProvider,
  type AiGeneratedImage,
  type AiProvider,
} from '@/lib/providers/ai-provider';
import { getAiProvider, getAiReadiness } from '@/lib/services/ai-readiness-service';

const sourceDigest = 'a'.repeat(64);
const fakeCandidate = aiRecipeCandidateSchema.parse({
  recipe: {
    title: 'Mocked soup',
    summary: '',
    servings: '4 bowls',
    prepMinutes: 5,
    cookMinutes: 20,
    sourceName: '',
    sourceUrl: '',
    tags: [],
    ingredientGroups: [
      { name: '', ingredients: [{ quantity: '', unit: '', item: 'tomato', note: '' }] },
    ],
    instructionSections: [{ title: '', steps: ['Simmer and review.'] }],
  },
  confidence: 0.5,
  warnings: ['Review the quantity.'],
  uncertainSegments: [
    { field: 'ingredients[0].quantity', rawText: 'some', reason: 'Ambiguous source.' },
  ],
});

const fakeNutritionEstimate = aiNutritionEstimateSchema.parse({
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

class DeterministicTestAiProvider implements AiProvider {
  readonly name = 'OpenAI' as const;

  getStatus(): AiConnectionStatus {
    return getAiReadiness();
  }

  async createTextReviewCandidate(): Promise<AiRecipeCandidate> {
    return fakeCandidate;
  }

  async createVisionReviewCandidate(): Promise<AiRecipeCandidate> {
    return fakeCandidate;
  }

  async generateRecipeImage(): Promise<AiGeneratedImage> {
    return { bytes: Buffer.from('test-image'), altText: 'Test image' };
  }

  async estimateRecipeNutrition(): Promise<AiNutritionEstimate> {
    return fakeNutritionEstimate;
  }

  async improveRecipe(): Promise<AiRecipeCandidate> {
    return fakeCandidate;
  }
}

describe('AI readiness boundary', () => {
  it('returns a truthful disabled status without reading provider configuration', () => {
    expect(getAiReadiness()).toEqual({
      provider: 'OpenAI',
      state: 'unconfigured',
      enabled: false,
      message:
        'OpenAI is not configured. Add a server-side key before any household action can use it.',
      supportedOperationKinds: [
        'text-normalization',
        'vision-extraction',
        'image-generation',
        'nutrition-estimation',
        'recipe-improvement',
      ],
    });
  });

  it('uses a strict review contract and keeps the production provider unavailable', async () => {
    expect(
      aiReviewRequestSchema.parse({
        kind: 'text-normalization',
        sourceDigest,
        sourceLabel: 'Pasted recipe',
      }),
    ).toMatchObject({ kind: 'text-normalization', sourceDigest });
    expect(
      aiRecipeCandidateSchema.safeParse({
        ...fakeCandidate,
        unexpected: true,
      }).success,
    ).toBe(false);

    const provider: AiProvider = getAiProvider();
    await expect(
      provider.createTextReviewCandidate({
        kind: 'text-normalization',
        sourceDigest,
        sourceLabel: 'Recipe scan',
        sourceText: 'A recipe source long enough for the internal test contract.',
        improve: false,
      }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);

    const testFake: AiProvider = new DeterministicTestAiProvider();
    await expect(
      testFake.createTextReviewCandidate({
        kind: 'text-normalization',
        sourceDigest,
        sourceLabel: 'Fixture recipe',
        sourceText: 'A recipe source long enough for the internal test contract.',
        improve: false,
      }),
    ).resolves.toEqual(fakeCandidate);
  });

  it('generates an OpenAI-compatible schema while preserving app URL validation', () => {
    const format = zodTextFormat(
      aiRecipeCandidateStructuredOutputSchema,
      'recipe_review_candidate',
    );

    expect(format.schema).toMatchObject({
      properties: {
        recipe: {
          properties: {
            sourceUrl: { type: 'string', maxLength: 2_048 },
          },
        },
      },
    });
    expect(JSON.stringify(format.schema)).not.toContain('"format":"uri"');

    const invalidSourceUrlCandidate = {
      ...fakeCandidate,
      recipe: { ...fakeCandidate.recipe, sourceUrl: 'not a valid URL' },
    };
    expect(
      aiRecipeCandidateStructuredOutputSchema.safeParse(invalidSourceUrlCandidate).success,
    ).toBe(true);
    expect(aiRecipeCandidateSchema.safeParse(invalidSourceUrlCandidate).success).toBe(false);
  });

  it('uses strict OpenAI SDK requests with a deterministic injected client', async () => {
    const reviewRequests: unknown[] = [];
    const imageRequests: unknown[] = [];
    const provider = new OpenAiProvider('test-key-that-is-never-sent', {
      responses: {
        parse: async (request: unknown) => {
          reviewRequests.push(request);
          return {
            output_parsed: reviewRequests.length === 3 ? fakeNutritionEstimate : fakeCandidate,
          };
        },
      },
      images: {
        generate: async (request: unknown) => {
          imageRequests.push(request);
          return { data: [{ b64_json: Buffer.from('generated-image').toString('base64') }] };
        },
      },
    });

    await expect(
      provider.createTextReviewCandidate({
        kind: 'text-normalization',
        sourceDigest,
        sourceLabel: 'Family notebook',
        sourceText: 'Tomato soup\nIngredients\n2 tomatoes\nMethod\n1. Simmer.',
        improve: false,
      }),
    ).resolves.toEqual(fakeCandidate);
    await expect(
      provider.createVisionReviewCandidate({
        kind: 'vision-extraction',
        sourceDigest,
        sourceLabel: 'Recipe scan',
        imageDataUrls: ['data:image/webp;base64,UklGRg=='],
        improve: true,
      }),
    ).resolves.toEqual(fakeCandidate);
    await expect(
      provider.estimateRecipeNutrition({
        recipeTitle: 'Tomato soup',
        recipeSummary: 'A simple bowl.',
        servings: '4 bowls',
        ingredientGroups: [
          {
            name: '',
            ingredients: [{ quantity: 2, unit: '', item: 'tomatoes', note: 'roughly chopped' }],
          },
        ],
        instructionSteps: ['Simmer until fragrant.'],
      }),
    ).resolves.toEqual(fakeNutritionEstimate);
    await expect(provider.improveRecipe({ recipe: fakeCandidate.recipe })).resolves.toEqual(
      fakeCandidate,
    );
    await expect(
      provider.generateRecipeImage({
        recipeTitle: 'Tomato soup',
        recipeSummary: 'A simple bowl.',
        ingredientNames: ['tomatoes', 'olive oil'],
      }),
    ).resolves.toMatchObject({ altText: 'AI-generated serving image for Tomato soup' });

    expect(reviewRequests).toHaveLength(4);
    expect(reviewRequests[0]).toMatchObject({ model: 'gpt-5.4-mini', text: { format: {} } });
    expect(reviewRequests[0]).toMatchObject({
      instructions: expect.stringContaining('infer a practical numeric serving yield'),
    });
    expect(reviewRequests[0]).toMatchObject({
      instructions: expect.stringContaining('Estimate calories, protein, carbohydrates'),
    });
    expect(reviewRequests[1]).toMatchObject({
      instructions: expect.stringContaining('AI Improve is enabled'),
      input: [
        {
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'input_image', detail: 'low' }),
          ]),
        },
      ],
    });
    expect(reviewRequests[2]).toMatchObject({
      model: 'gpt-5.4-mini',
      instructions: expect.stringContaining('nutrition per serving'),
      input: [
        {
          content: expect.stringContaining('"servings":"4 bowls"'),
        },
      ],
    });
    expect(reviewRequests[3]).toMatchObject({
      instructions: expect.stringContaining('Keep the same ingredient items'),
      input: [
        {
          content: expect.stringContaining('Mocked soup'),
        },
      ],
    });
    expect(imageRequests[0]).toMatchObject({
      model: 'gpt-image-2',
      output_format: 'webp',
      quality: 'low',
      size: '1024x1024',
    });
  });

  it('repairs OCR amounts and units into their structured ingredient fields', () => {
    const normalized = normalizeAiRecipeCandidate({
      ...fakeCandidate,
      recipe: {
        ...fakeCandidate.recipe,
        ingredientGroups: [
          {
            name: 'Vegetables',
            ingredients: [
              { quantity: '', unit: '', item: 'bell peppers', note: '3–4, cut in half' },
              { quantity: '', unit: '', item: 'elephant garlic bulbs', note: '1, cut in half' },
              { quantity: '', unit: '', item: 'cherry tomatoes', note: '1-2 c.' },
              { quantity: '', unit: '', item: '0.5 c. pasta water', note: '' },
            ],
          },
        ],
      },
    });

    expect(normalized.recipe.ingredientGroups[0]?.ingredients).toEqual([
      { quantity: 3, unit: '', item: 'bell peppers', note: 'up to 4; cut in half' },
      { quantity: 1, unit: '', item: 'elephant garlic bulbs', note: 'cut in half' },
      { quantity: 1, unit: 'cup', item: 'cherry tomatoes', note: 'up to 2 cup' },
      { quantity: 0.5, unit: 'cup', item: 'pasta water', note: '' },
    ]);
  });
});
