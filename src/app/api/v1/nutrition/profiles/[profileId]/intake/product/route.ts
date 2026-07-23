import { NextResponse } from 'next/server';

import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { productConsumptionRequestSchema } from '@/lib/domain/nutrition-food-diary';
import { appendConfirmedProductConsumption } from '@/lib/services/nutrition-food-diary-service';

type Context = { params: Promise<{ profileId: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const input = productConsumptionRequestSchema.parse(await readJson(request));
    return NextResponse.json(
      { revision: appendConfirmedProductConsumption(profileId, auth.actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
