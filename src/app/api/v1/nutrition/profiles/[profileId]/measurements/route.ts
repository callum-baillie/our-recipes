import { NextResponse } from 'next/server';

import { bodyMeasurementInputSchema } from '@/lib/domain/nutrition-profile';
import {
  listBodyMeasurements,
  recordBodyMeasurement,
} from '@/lib/services/nutrition-profile-service';
import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

type Context = { params: Promise<{ profileId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    return NextResponse.json({
      measurements: listBodyMeasurements(profileId, auth.principal.id),
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
    const input = bodyMeasurementInputSchema.parse(await readJson(request));
    return NextResponse.json(
      { measurement: recordBodyMeasurement(profileId, auth.actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
