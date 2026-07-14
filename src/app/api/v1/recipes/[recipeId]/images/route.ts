import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { MAX_RECIPE_IMAGE_BYTES, recipeImageAltTextSchema } from '@/lib/domain/recipe-image';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { RecipeNotFoundError } from '@/lib/services/recipe-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';
import { RecipeImageUploadError } from '@/lib/domain/recipe-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function imageUploadError(error: RecipeImageUploadError) {
  return jsonError(error.code === 'file_too_large' ? 413 : 400, error.code, error.message);
}

export async function POST(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RECIPE_IMAGE_BYTES + 20_000) {
    return jsonError(413, 'file_too_large', 'Recipe photos must be 10 MB or smaller.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before adding a photo.',
    );
  }
  const formData = await request.formData().catch(() => null);
  const image = formData?.get('image');
  if (!(image instanceof File)) {
    return jsonError(400, 'invalid_image', 'Choose one JPEG, PNG, or WebP image to add.');
  }
  const altTextValue = formData?.get('altText');
  const parsedAltText = recipeImageAltTextSchema.safeParse(
    typeof altTextValue === 'string' ? altTextValue : '',
  );
  if (!parsedAltText.success) {
    return jsonError(400, 'invalid_alt_text', 'Keep the photo description under 180 characters.');
  }
  try {
    const created = await createRecipeImage(
      (await context.params).recipeId,
      actor.profileId,
      new Uint8Array(await image.arrayBuffer()),
      parsedAltText.data,
    );
    return NextResponse.json(
      {
        image: {
          id: created.id,
          altText: created.altText,
          width: created.width,
          height: created.height,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RecipeImageUploadError) return imageUploadError(error);
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
