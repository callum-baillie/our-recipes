import { recipeImagePreviewRequestSchema } from '@/lib/domain/recipe-image-generation';
import {
  prepareRecipeImageCandidate,
  RecipeImageCandidateError,
} from '@/lib/services/recipe-image-candidate-service';
import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { aiImageGenerationRequestSchema } from '@/lib/domain/ai';
import { jsonError } from '@/lib/http';
import { AiOperationError } from '@/lib/services/ai-operation-service';
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
  const payload = await request.json().catch(() => null);
  const preview = recipeImagePreviewRequestSchema.safeParse(payload);
  if (!preview.success && !aiImageGenerationRequestSchema.safeParse(payload).success) {
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
    if (preview.success) {
      const candidate = await prepareRecipeImageCandidate(
        access.principal,
        (await context.params).recipeId,
        preview.data,
        request.signal,
      );
      return withApiRequestId(
        NextResponse.json({ candidate }, { status: candidate.status === 'requested' ? 202 : 200 }),
        access.requestId,
      );
    }
    return withApiRequestId(
      jsonError(
        409,
        'image_review_required',
        'Generate a reviewed candidate using an operationId and expectedRevision, then explicitly accept it. Direct image attachment is no longer supported.',
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeImageCandidateError)
      return withApiRequestId(jsonError(error.status, error.code, error.message), access.requestId);
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    if (error instanceof AiOperationError) {
      const status =
        error.code === 'ai_sharing_disabled'
          ? 403
          : error.code === 'rate_limited'
            ? 429
            : error.code === 'ai_not_configured'
              ? 503
              : 422;
      return withApiRequestId(jsonError(status, error.code, error.message), access.requestId);
    }
    throw error;
  }
}
