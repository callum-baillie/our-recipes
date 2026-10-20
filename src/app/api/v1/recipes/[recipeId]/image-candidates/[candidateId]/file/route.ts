import { NextResponse } from 'next/server';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { jsonError } from '@/lib/http';
import {
  getRecipeImageCandidateFile,
  RecipeImageCandidateError,
} from '@/lib/services/recipe-image-candidate-service';
import { RecipeImageStorageError } from '@/lib/storage/recipe-image-storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  context: { params: Promise<{ recipeId: string; candidateId: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    const { recipeId, candidateId } = await context.params;
    const data = await getRecipeImageCandidateFile(access.principal, recipeId, candidateId);
    return withApiRequestId(
      new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'private, no-store',
          'Content-Length': String(data.length),
          'X-Content-Type-Options': 'nosniff',
        },
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeImageCandidateError)
      return withApiRequestId(jsonError(error.status, error.code, error.message), access.requestId);
    if (error instanceof RecipeImageStorageError)
      return withApiRequestId(
        jsonError(
          404,
          'image_file_unavailable',
          'The generated image file is no longer available.',
        ),
        access.requestId,
      );
    throw error;
  }
}
