import { NextResponse } from 'next/server';

import {
  appendUserEnteredNutritionIntakeRevision,
  listNutritionIntakeRevisions,
} from '@/lib/services/nutrition-intake-service';
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
      revisions: listNutritionIntakeRevisions(profileId, auth.principal.id),
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
    return NextResponse.json(
      {
        revision: appendUserEnteredNutritionIntakeRevision(
          profileId,
          auth.actor,
          await readJson(request),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
