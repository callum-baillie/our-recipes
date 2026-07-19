import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { aiRecipeImprovementRequestSchema } from '@/lib/domain/ai';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { AiOperationError, improveAiRecipe } from '@/lib/services/ai-operation-service';
import { RecipeConflictError, RecipeNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      403,
      'untrusted_origin',
      'This AI improvement must come from a trusted app origin.',
    );
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before improving a recipe.',
    );
  }
  const parsed = aiRecipeImprovementRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'invalid_recipe_improvement',
      'Check the recipe fields and confirm this OpenAI improvement request.',
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
    return NextResponse.json(
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
