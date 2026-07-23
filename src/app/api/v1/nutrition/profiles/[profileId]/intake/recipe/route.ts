import { NextResponse } from 'next/server';

import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { recipeConsumptionRequestSchema } from '@/lib/domain/nutrition-recipe-calculation';
import { appendConfirmedRecipeConsumption } from '@/lib/services/nutrition-recipe-calculation-service';

type Context = { params: Promise<{ profileId: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const input = recipeConsumptionRequestSchema.parse(await readJson(request));
    return NextResponse.json(
      {
        revision: appendConfirmedRecipeConsumption(profileId, auth.actor, input),
      },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
