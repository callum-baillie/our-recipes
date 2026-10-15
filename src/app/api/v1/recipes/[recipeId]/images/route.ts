import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { MAX_RECIPE_IMAGE_BYTES, recipeImageAltTextSchema } from '@/lib/domain/recipe-image';
import { jsonError } from '@/lib/http';
import { RecipeNotFoundError } from '@/lib/services/recipe-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';
import { RecipeImageUploadError } from '@/lib/domain/recipe-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function imageUploadError(error: RecipeImageUploadError) {
  return jsonError(error.code === 'file_too_large' ? 413 : 400, error.code, error.message);
}

export async function POST(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RECIPE_IMAGE_BYTES + 20_000) {
    return withApiRequestId(
      jsonError(413, 'file_too_large', 'Recipe photos must be 10 MB or smaller.'),
      access.requestId,
    );
  }
  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before adding a photo.',
      ),
      access.requestId,
    );
  }
  const formData = await request.formData().catch(() => null);
  const image = formData?.get('image');
  if (!(image instanceof File)) {
    return withApiRequestId(
      jsonError(400, 'invalid_image', 'Choose one JPEG, PNG, or WebP image to add.'),
      access.requestId,
    );
  }
  const altTextValue = formData?.get('altText');
  const parsedAltText = recipeImageAltTextSchema.safeParse(
    typeof altTextValue === 'string' ? altTextValue : '',
  );
  if (!parsedAltText.success) {
    return withApiRequestId(
      jsonError(400, 'invalid_alt_text', 'Keep the photo description under 180 characters.'),
      access.requestId,
    );
  }
  try {
    const created = await createRecipeImage(
      (await context.params).recipeId,
      actor.profileId,
      new Uint8Array(await image.arrayBuffer()),
      parsedAltText.data,
    );
    return withApiRequestId(
      NextResponse.json(
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
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeImageUploadError)
      return withApiRequestId(imageUploadError(error), access.requestId);
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}
