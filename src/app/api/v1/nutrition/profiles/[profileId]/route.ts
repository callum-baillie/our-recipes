import { NextResponse } from 'next/server';
import { z } from 'zod';

import { nutritionProfileSettingsInputSchema } from '@/lib/domain/nutrition-profile';
import {
  getSharedNutritionProfile,
  updateNutritionProfileSettings,
} from '@/lib/services/nutrition-profile-service';
import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

type Context = { params: Promise<{ profileId: string }> };
const updateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    settings: nutritionProfileSettingsInputSchema,
  })
  .strict();

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    return NextResponse.json({
      profile: getSharedNutritionProfile(profileId, auth.principal.id),
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const input = updateSchema.parse(await readJson(request));
    return NextResponse.json({
      profile: updateNutritionProfileSettings(
        profileId,
        auth.principal.id,
        input.expectedVersion,
        input.settings,
      ),
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}
