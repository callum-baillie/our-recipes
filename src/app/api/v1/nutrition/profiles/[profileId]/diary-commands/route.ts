import { NextResponse } from 'next/server';

import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { executeNutritionDiaryCommand } from '@/lib/services/nutrition-diary-lifecycle-service';

type Context = { params: Promise<{ profileId: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const command = executeNutritionDiaryCommand(profileId, auth.actor, await readJson(request));
    return NextResponse.json(command, { status: command.replayed ? 200 : 201 });
  } catch (error) {
    return nutritionApiError(error);
  }
}
