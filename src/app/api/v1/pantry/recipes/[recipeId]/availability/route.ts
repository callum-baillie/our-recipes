import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryRecipeAvailabilityQuerySchema } from '@/lib/domain/pantry-availability';
import { jsonError } from '@/lib/http';
import {
  getRecipePantryAvailability,
  PantryAvailabilityNotFoundError,
} from '@/lib/services/pantry-availability-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = pantryRecipeAvailabilityQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_servings', 'Use a valid positive serving count.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        availability: getRecipePantryAvailability(
          (await context.params).recipeId,
          parsed.data.servings,
        ),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryAvailabilityNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}
