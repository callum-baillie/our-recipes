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
  const parsed = pantryRecipeAvailabilityQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_servings', 'Use a valid positive serving count.');
  try {
    return NextResponse.json({
      availability: getRecipePantryAvailability(
        (await context.params).recipeId,
        parsed.data.servings,
      ),
    });
  } catch (error) {
    if (error instanceof PantryAvailabilityNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
