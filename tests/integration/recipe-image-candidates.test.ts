import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ensureDatabase, getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  aiOperationAudits,
  aiProfileSettings,
  recipeImageCandidates,
  recipes,
} from '@/lib/db/schema';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { emptyRecipeInput } from '@/lib/domain/recipe';
import type { AiProvider } from '@/lib/providers/ai-provider';
import { completeSetup } from '@/lib/services/household-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';
import { setAiProviderForTests } from '@/lib/services/ai-readiness-service';
import { resetAiRateLimitsForTests } from '@/lib/services/ai-operation-service';
import {
  acceptRecipeImageCandidate,
  discardRecipeImageCandidate,
  getRecipeImageCandidate,
  getRecipeImageCandidateFile,
  prepareRecipeImageCandidate,
} from '@/lib/services/recipe-image-candidate-service';
import { getAiDataPolicy } from '@/lib/services/ai-settings-service';

describe('reviewed recipe image requests', () => {
  let generate: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', '.test-data/image-candidates');
    resetDatabaseForTests();
    resetAiRateLimitsForTests();
    ensureDatabase();
    generate = vi.fn(async () => ({
      bytes: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#8b4513' } })
        .webp()
        .toBuffer(),
      altText: 'AI-generated serving image for Soup',
    }));
    setAiProviderForTests({
      name: 'OpenAI',
      getStatus: () => ({
        provider: 'OpenAI',
        state: 'configured',
        enabled: true,
        message: 'Fixture',
        supportedOperationKinds: ['image-generation'],
      }),
      generateRecipeImage: generate,
    } as unknown as AiProvider);
  });
  afterEach(() => {
    setAiProviderForTests(null);
    resetDatabaseForTests();
    resetAiRateLimitsForTests();
    rmSync('.test-data/image-candidates', { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  function fixture() {
    const profile = completeSetup({
      householdName: 'Image fixture',
      appName: 'Bòrd',
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
    const recipe = createRecipe(
      {
        ...emptyRecipeInput,
        title: 'Soup',
        servings: '4',
        ingredientGroups: [
          {
            name: '',
            ingredients: [
              {
                quantity: '500',
                unit: 'g',
                item: 'tomatoes',
                note: 'chopped',
                shoppingCategory: 'Fresh produce',
              },
            ],
          },
        ],
        instructionSections: [{ title: '', steps: ['Simmer until thick, then blend.'] }],
      },
      profile.id,
    );
    return {
      owner: { userId: 'fixture-account', profileId: profile.id, linkedProfileId: profile.id },
      recipe,
      request: {
        confirm: true as const,
        preview: true as const,
        operationId: randomUUID(),
        expectedRevision: recipe.currentRevision,
      },
    };
  }
  it('keeps generated content separate until reviewed; exact replay works without provider access', async () => {
    const { owner, recipe, request } = fixture();
    const candidate = await prepareRecipeImageCandidate(owner, recipe.id, request);
    expect(recipeImageInput(getRecipe(recipe.id)!)).toMatchObject({
      instructionSteps: ['Simmer until thick, then blend.'],
    });
    expect(candidate.status).toBe('ready');
    expect(getRecipe(recipe.id)?.images).toHaveLength(0);
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      servings: '4',
      ingredients: [{ quantity: 500, unit: 'g', item: 'tomatoes' }],
      instructionSteps: ['Simmer until thick, then blend.'],
    });
    expect(await getRecipeImageCandidateFile(owner, recipe.id, candidate.id)).toBeInstanceOf(
      Buffer,
    );
    setAiProviderForTests(null);
    expect(await prepareRecipeImageCandidate(owner, recipe.id, request)).toEqual(candidate);
    expect(generate).toHaveBeenCalledTimes(1);
    const accepted = acceptRecipeImageCandidate(owner, recipe.id, candidate.id);
    expect(accepted.status).toBe('accepted');
    expect(acceptRecipeImageCandidate(owner, recipe.id, candidate.id).imageId).toBe(
      accepted.imageId,
    );
    expect(getRecipe(recipe.id)?.images).toHaveLength(1);
    expect(getDatabase().select().from(aiOperationAudits).all()[0]?.promptVersion).toContain(
      'finished-dish-v2',
    );
  });
  it('binds intent, owner and the saved recipe version', async () => {
    const { owner, recipe, request } = fixture();
    const candidate = await prepareRecipeImageCandidate(owner, recipe.id, request);
    await expect(
      prepareRecipeImageCandidate(owner, recipe.id, { ...request, size: '1536x1024' }),
    ).rejects.toMatchObject({ code: 'image_request_changed' });
    expect(() =>
      getRecipeImageCandidate({ ...owner, userId: 'another-account' }, recipe.id, candidate.id),
    ).toThrow(/not available/);
    expect(() =>
      getRecipeImageCandidate({ ...owner, profileId: 'other-profile' }, recipe.id, candidate.id),
    ).toThrow(/own account profile/);
    getDatabase()
      .update(recipes)
      .set({ currentRevision: 2 })
      .where(eq(recipes.id, recipe.id))
      .run();
    expect(() => acceptRecipeImageCandidate(owner, recipe.id, candidate.id)).toThrow(
      /recipe changed/,
    );
    expect(getRecipe(recipe.id)?.images).toHaveLength(0);
  });
  it('does not retry an uncertain generation; discard wins over a late result', async () => {
    const { owner, recipe, request } = fixture();
    let finish!: () => void;
    const deferred = new Promise<void>((resolve) => {
      finish = resolve;
    });
    generate.mockImplementationOnce(async () => {
      await deferred;
      return {
        bytes: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
          .webp()
          .toBuffer(),
        altText: 'Fixture',
      };
    });
    const pending = prepareRecipeImageCandidate(owner, recipe.id, request);
    expect((await prepareRecipeImageCandidate(owner, recipe.id, request)).status).toBe('requested');
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await discardRecipeImageCandidate(owner, recipe.id, request.operationId)).status).toBe(
      'discarded',
    );
    finish();
    expect((await pending).status).toBe('discarded');
    expect(getRecipe(recipe.id)?.images).toHaveLength(0);
    expect(() => acceptRecipeImageCandidate(owner, recipe.id, request.operationId)).toThrow(
      /Review an available/,
    );
  });
  it('preserves uncertain operation identity and requires new deliberate paid intent', async () => {
    const { owner, recipe, request } = fixture();
    generate.mockRejectedValueOnce(new Error('Controlled provider timeout'));
    expect((await prepareRecipeImageCandidate(owner, recipe.id, request)).status).toBe(
      'outcome_unknown',
    );
    expect((await prepareRecipeImageCandidate(owner, recipe.id, request)).status).toBe(
      'outcome_unknown',
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(getDatabase().select().from(recipeImageCandidates).all()).toHaveLength(1);
  });
  it('enforces sharing and administrator image defaults before creating a request', async () => {
    const { owner, recipe, request } = fixture();
    await expect(
      prepareRecipeImageCandidate(owner, recipe.id, { ...request, quality: 'high' }),
    ).rejects.toMatchObject({ code: 'image_override_disabled' });
    getAiDataPolicy(owner.profileId);
    getDatabase()
      .update(aiProfileSettings)
      .set({ shareSharedRecipes: false })
      .where(eq(aiProfileSettings.profileId, owner.profileId))
      .run();
    await expect(prepareRecipeImageCandidate(owner, recipe.id, request)).rejects.toMatchObject({
      code: 'recipe_sharing_disabled',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(getDatabase().select().from(recipeImageCandidates).all()).toHaveLength(0);
  });
});
