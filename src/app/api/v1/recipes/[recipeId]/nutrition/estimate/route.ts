import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { aiNutritionEstimationRequestSchema } from '@/lib/domain/ai';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { AiOperationError, estimateAiRecipeNutrition } from '@/lib/services/ai-operation-service';
import { RecipeConflictError, RecipeNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      403,
      'untrusted_origin',
      'This nutrition estimate must come from a trusted app origin.',
    );
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before estimating recipe nutrition.',
    );
  }
  const parsed = aiNutritionEstimationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonError(
      400,
      'ai_confirmation_required',
      'Confirm this OpenAI nutrition estimate and refresh stale recipe data before it can start.',
    );
  }
  try {
    const created = await estimateAiRecipeNutrition({
      actorProfileId: actor.profileId,
      recipeId: (await context.params).recipeId,
      expectedRevision: parsed.data.expectedRevision,
    });
    return NextResponse.json(
      {
        recipe: {
          id: created.recipe.id,
          currentRevision: created.recipe.currentRevision,
          servings: created.recipe.servings,
          nutritionCalories: created.recipe.nutritionCalories,
          nutritionProteinGrams: created.recipe.nutritionProteinGrams,
          nutritionCarbohydrateGrams: created.recipe.nutritionCarbohydrateGrams,
          nutritionFatGrams: created.recipe.nutritionFatGrams,
          nutritionSaturatedFatGrams: created.recipe.nutritionSaturatedFatGrams,
          nutritionFiberGrams: created.recipe.nutritionFiberGrams,
          nutritionSugarGrams: created.recipe.nutritionSugarGrams,
          nutritionSodiumMilligrams: created.recipe.nutritionSodiumMilligrams,
        },
        estimate: {
          confidence: created.estimate.confidence,
          warnings: created.estimate.warnings,
        },
        integration: created.integration,
        audit: {
          id: created.audit.id,
          kind: created.audit.kind,
          status: created.audit.status,
        },
      },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      },
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      return jsonError(404, 'recipe_not_found', error.message);
    }
    if (error instanceof RecipeConflictError) {
      return jsonError(409, 'recipe_revision_conflict', error.message);
    }
    if (error instanceof AiOperationError) {
      const status =
        error.code === 'rate_limited' ? 429 : error.code === 'ai_not_configured' ? 503 : 422;
      return jsonError(status, error.code, error.message);
    }
    throw error;
  }
}
