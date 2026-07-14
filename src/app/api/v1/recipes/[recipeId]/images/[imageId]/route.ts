import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  deleteRecipeImage,
  getRecipeImageFile,
  RecipeImageNotFoundError,
} from '@/lib/services/recipe-image-service';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { cookies } from 'next/headers';
import { hasTrustedMutationOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ recipeId: string; imageId: string }> },
) {
  try {
    const { recipeId, imageId } = await context.params;
    const { data } = await getRecipeImageFile(recipeId, imageId);
    const body = new Uint8Array(data.length);
    body.set(data);
    return new NextResponse(body, {
      headers: {
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(data.length),
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof RecipeImageNotFoundError) {
      return jsonError(404, 'recipe_image_not_found', error.message);
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ recipeId: string; imageId: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before removing a photo.',
    );
  }
  try {
    const { recipeId, imageId } = await context.params;
    await deleteRecipeImage(recipeId, imageId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof RecipeImageNotFoundError) {
      return jsonError(404, 'recipe_image_not_found', error.message);
    }
    throw error;
  }
}
