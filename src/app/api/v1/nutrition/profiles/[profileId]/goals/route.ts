import { NextResponse } from 'next/server';
import { z } from 'zod';

import { nutritionGoalVersionInputSchema } from '@/lib/domain/nutrition-profile';
import {
  appendNutritionGoalVersion,
  listNutritionGoalVersions,
} from '@/lib/services/nutrition-profile-service';
import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

type Context = { params: Promise<{ profileId: string }> };
const inputSchema = z.object({
  goal: nutritionGoalVersionInputSchema,
  seriesId: z.string().uuid().optional(),
  supersedesGoalVersionId: z.string().uuid().nullable().optional(),
});

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    return NextResponse.json({ goals: listNutritionGoalVersions(profileId, auth.principal.id) });
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
    const input = inputSchema.parse(await readJson(request));
    return NextResponse.json(
      {
        goal: appendNutritionGoalVersion(profileId, auth.actor, input.goal, {
          seriesId: input.seriesId,
          supersedesGoalVersionId: input.supersedesGoalVersionId,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
