import { NextResponse } from 'next/server';

import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { createPreparedRecipeSchema } from '@/lib/domain/nutrition-prepared-consumption';
import {
  createPreparedRecipeInstance,
  listPreparedRecipeInstances,
} from '@/lib/services/nutrition-prepared-consumption-service';

type Context = { params: Promise<{ profileId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    return NextResponse.json({
      preparedRecipes: listPreparedRecipeInstances(profileId, auth.principal.id),
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const input = createPreparedRecipeSchema.parse(await readJson(request));
    return NextResponse.json(
      { preparedRecipe: createPreparedRecipeInstance(profileId, auth.actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
