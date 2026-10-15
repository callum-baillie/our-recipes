import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  deleteRecipeImage,
  getRecipeImageFile,
  RecipeImageNotFoundError,
} from '@/lib/services/recipe-image-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ recipeId: string; imageId: string }> },
) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  try {
    const { recipeId, imageId } = await context.params;
    const { data } = await getRecipeImageFile(recipeId, imageId);
    const body = new Uint8Array(data.length);
    body.set(data);
    return withApiRequestId(
      new NextResponse(body, {
        headers: {
          'Cache-Control': 'private, max-age=3600',
          'Content-Length': String(data.length),
          'Content-Type': 'image/webp',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeImageNotFoundError) {
      return withApiRequestId(
        jsonError(404, 'recipe_image_not_found', error.message),
        access.requestId,
      );
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ recipeId: string; imageId: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before removing a photo.',
      ),
      access.requestId,
    );
  }
  try {
    const { recipeId, imageId } = await context.params;
    await deleteRecipeImage(recipeId, imageId);
    return withApiRequestId(new NextResponse(null, { status: 204 }), access.requestId);
  } catch (error) {
    if (error instanceof RecipeImageNotFoundError) {
      return withApiRequestId(
        jsonError(404, 'recipe_image_not_found', error.message),
        access.requestId,
      );
    }
    throw error;
  }
}
