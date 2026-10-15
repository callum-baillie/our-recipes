import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { aiRecipeImprovementRequestSchema } from '@/lib/domain/ai';
import { jsonError } from '@/lib/http';
import { AiOperationError, improveAiRecipe } from '@/lib/services/ai-operation-service';
import { RecipeConflictError, RecipeNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before improving a recipe.',
      ),
      access.requestId,
    );
  }
  const parsed = aiRecipeImprovementRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withApiRequestId(
      jsonError(
        400,
        'invalid_recipe_improvement',
        'Check the recipe fields and confirm this OpenAI improvement request.',
      ),
      access.requestId,
    );
  }
  try {
    const { recipeId } = await context.params;
    const improved = await improveAiRecipe({
      actorProfileId: actor.profileId,
      recipeId,
      expectedRevision: parsed.data.expectedRevision,
      recipe: parsed.data.recipe,
    });
    return withApiRequestId(
      NextResponse.json(
        {
          candidate: improved.candidate,
          audit: {
            id: improved.audit.id,
            kind: improved.audit.kind,
            status: improved.audit.status,
          },
        },
        {
          status: 201,
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        },
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    }
    if (error instanceof RecipeConflictError) {
      return withApiRequestId(
        jsonError(409, 'recipe_revision_conflict', error.message),
        access.requestId,
      );
    }
    if (error instanceof AiOperationError) {
      const status =
        error.code === 'rate_limited' ? 429 : error.code === 'ai_not_configured' ? 503 : 422;
      return withApiRequestId(jsonError(status, error.code, error.message), access.requestId);
    }
    throw error;
  }
}
