import { NextResponse } from 'next/server';

import { listAccessibleNutritionProfiles } from '@/lib/services/nutrition-profile-service';
import {
  nutritionApiError,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

export async function GET() {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ profiles: listAccessibleNutritionProfiles(auth.principal.id) });
  } catch (error) {
    return nutritionApiError(error);
  }
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  return NextResponse.json(
    {
      error: {
        code: 'nutrition_profile_creation_retired',
        message: 'Add household profiles from profile settings; Nutrition links automatically.',
      },
    },
    { status: 410 },
  );
}
