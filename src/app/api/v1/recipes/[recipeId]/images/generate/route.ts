import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { aiImageGenerationRequestSchema } from '@/lib/domain/ai';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { AiOperationError, generateAiRecipeImage } from '@/lib/services/ai-operation-service';
import { RecipeNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      403,
      'untrusted_origin',
      'This image generation must come from a trusted app origin.',
    );
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before generating a recipe image.',
    );
  }
  if (!aiImageGenerationRequestSchema.safeParse(await request.json().catch(() => null)).success) {
    return jsonError(
      400,
      'ai_confirmation_required',
      'Confirm this OpenAI image-generation action before it can start.',
    );
  }
  try {
    const created = await generateAiRecipeImage({
      actorProfileId: actor.profileId,
      recipeId: (await context.params).recipeId,
    });
    return NextResponse.json(
      {
        image: { id: created.imageId },
        audit: { id: created.audit.id, kind: created.audit.kind, status: created.audit.status },
      },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      },
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    if (error instanceof AiOperationError) {
      const status =
        error.code === 'rate_limited' ? 429 : error.code === 'ai_not_configured' ? 503 : 422;
      return jsonError(status, error.code, error.message);
    }
    throw error;
  }
}
