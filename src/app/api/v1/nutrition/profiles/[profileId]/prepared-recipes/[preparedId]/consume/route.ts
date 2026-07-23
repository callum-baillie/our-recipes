import { NextResponse } from 'next/server';

import {
  nutritionApiError,
  nutritionProfileIdSchema,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { confirmPreparedConsumptionSchema } from '@/lib/domain/nutrition-prepared-consumption';
import { confirmPreparedRecipeConsumption } from '@/lib/services/nutrition-prepared-consumption-service';

type Context = { params: Promise<{ profileId: string; preparedId: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const params = await context.params;
    const profileId = parseNutritionProfileId(params.profileId);
    const preparedId = nutritionProfileIdSchema.parse(params.preparedId);
    const input = confirmPreparedConsumptionSchema.parse(await readJson(request));
    const result = confirmPreparedRecipeConsumption(profileId, preparedId, auth.actor, input);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return nutritionApiError(error);
  }
}
