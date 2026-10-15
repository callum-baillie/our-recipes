import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { aiImageGenerationRequestSchema } from '@/lib/domain/ai';
import { jsonError } from '@/lib/http';
import { AiOperationError, generateAiRecipeImage } from '@/lib/services/ai-operation-service';
import { RecipeNotFoundError } from '@/lib/services/recipe-service';

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
        'Choose a household profile before generating a recipe image.',
      ),
      access.requestId,
    );
  }
  if (!aiImageGenerationRequestSchema.safeParse(await request.json().catch(() => null)).success) {
    return withApiRequestId(
      jsonError(
        400,
        'ai_confirmation_required',
        'Confirm this OpenAI image-generation action before it can start.',
      ),
      access.requestId,
    );
  }
  try {
    const created = await generateAiRecipeImage({
      actorProfileId: actor.profileId,
      recipeId: (await context.params).recipeId,
    });
    return withApiRequestId(
      NextResponse.json(
        {
          image: { id: created.imageId },
          audit: { id: created.audit.id, kind: created.audit.kind, status: created.audit.status },
        },
        {
          status: 201,
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        },
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    if (error instanceof AiOperationError) {
      const status =
        error.code === 'rate_limited' ? 429 : error.code === 'ai_not_configured' ? 503 : 422;
      return withApiRequestId(jsonError(status, error.code, error.message), access.requestId);
    }
    throw error;
  }
}
