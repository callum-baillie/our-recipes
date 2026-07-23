import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { deleteIntakeRequestSchema } from '@/lib/domain/nutrition-food-diary';
import { deleteNutritionIntake } from '@/lib/services/nutrition-food-diary-service';

type Context = { params: Promise<{ profileId: string; revisionId: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const params = await context.params;
    const profileId = parseNutritionProfileId(params.profileId);
    const revisionId = z.string().uuid().parse(params.revisionId);
    const input = deleteIntakeRequestSchema.parse(await readJson(request));
    return NextResponse.json({
      revision: deleteNutritionIntake(profileId, auth.actor, revisionId, input),
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}
