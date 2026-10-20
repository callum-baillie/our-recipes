import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { jsonError } from '@/lib/http';
import {
  acceptRecipeImageCandidate,
  discardRecipeImageCandidate,
  getRecipeImageCandidate,
  RecipeImageCandidateError,
} from '@/lib/services/recipe-image-candidate-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ recipeId: string; candidateId: string }> };
async function handle(request: Request, context: Context) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    const { recipeId, candidateId } = await context.params;
    if (!z.uuid().safeParse(candidateId).success)
      return withApiRequestId(
        jsonError(400, 'invalid_candidate', 'Choose a valid image request.'),
        access.requestId,
      );
    if (
      request.method === 'POST' &&
      !z
        .object({ action: z.literal('accept') })
        .strict()
        .safeParse(await request.json().catch(() => null)).success
    )
      return withApiRequestId(
        jsonError(
          400,
          'image_confirmation_required',
          'Confirm the reviewed image before adding it.',
        ),
        access.requestId,
      );
    const candidate =
      request.method === 'GET'
        ? getRecipeImageCandidate(access.principal, recipeId, candidateId)
        : request.method === 'POST'
          ? acceptRecipeImageCandidate(access.principal, recipeId, candidateId)
          : await discardRecipeImageCandidate(access.principal, recipeId, candidateId);
    return withApiRequestId(NextResponse.json({ candidate }), access.requestId);
  } catch (error) {
    if (error instanceof RecipeImageCandidateError)
      return withApiRequestId(jsonError(error.status, error.code, error.message), access.requestId);
    throw error;
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
