import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  aiRecipeCandidateSchema,
  aiReviewRequestSchema,
  type AiConnectionStatus,
  type AiRecipeCandidate,
} from '@/lib/domain/ai';
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
}

describe('AI readiness boundary', () => {
  it('returns a truthful disabled status without reading provider configuration', () => {
    expect(getAiReadiness()).toEqual({
      provider: 'OpenAI',
      state: 'unconfigured',
      enabled: false,
      message:
        'OpenAI is not configured. Add a server-side key before any household action can use it.',
      supportedOperationKinds: ['text-normalization', 'vision-extraction', 'image-generation'],
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
      }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);

    const testFake: AiProvider = new DeterministicTestAiProvider();
    await expect(
      testFake.createTextReviewCandidate({
        kind: 'text-normalization',
        sourceDigest,
        sourceLabel: 'Fixture recipe',
        sourceText: 'A recipe source long enough for the internal test contract.',
      }),
    ).resolves.toEqual(fakeCandidate);
  });

  it('uses strict OpenAI SDK requests with a deterministic injected client', async () => {
    const reviewRequests: unknown[] = [];
    const imageRequests: unknown[] = [];
    const provider = new OpenAiProvider('test-key-that-is-never-sent', {
      responses: {
        parse: async (request: unknown) => {
          reviewRequests.push(request);
          return { output_parsed: fakeCandidate };
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
      }),
    ).resolves.toEqual(fakeCandidate);
    await expect(
      provider.createVisionReviewCandidate({
        kind: 'vision-extraction',
        sourceDigest,
        sourceLabel: 'Recipe scan',
        imageDataUrls: ['data:image/webp;base64,UklGRg=='],
      }),
    ).resolves.toEqual(fakeCandidate);
    await expect(
      provider.generateRecipeImage({
        recipeTitle: 'Tomato soup',
        recipeSummary: 'A simple bowl.',
        ingredientNames: ['tomatoes', 'olive oil'],
      }),
    ).resolves.toMatchObject({ altText: 'AI-generated serving image for Tomato soup' });

    expect(reviewRequests).toHaveLength(2);
    expect(reviewRequests[0]).toMatchObject({ model: 'gpt-5.4-mini', text: { format: {} } });
    expect(reviewRequests[1]).toMatchObject({
      input: [
        {
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'input_image', detail: 'low' }),
          ]),
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
});
