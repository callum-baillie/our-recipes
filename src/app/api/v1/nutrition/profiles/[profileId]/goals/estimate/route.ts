import { NextResponse } from 'next/server';

import { nutritionEnergyEstimateRequestSchema } from '@/lib/domain/nutrition-energy-estimate';
import { previewOrApplyNutritionEnergyEstimate } from '@/lib/services/nutrition-energy-estimate-service';
import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

type Context = { params: Promise<{ profileId: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const input = nutritionEnergyEstimateRequestSchema.parse(await readJson(request));
    return NextResponse.json(previewOrApplyNutritionEnergyEstimate(profileId, auth.actor, input), {
      status: input.action === 'apply' ? 201 : 200,
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}
