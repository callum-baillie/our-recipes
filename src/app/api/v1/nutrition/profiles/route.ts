import { NextResponse } from 'next/server';

import { listAccessibleNutritionProfiles } from '@/lib/services/nutrition-profile-service';
import {
  nutritionApiError,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
export async function GET(request: Request) {
  const auth = await requireNutritionPrincipal(request);
  if (auth.response) return auth.response;
  try {
    const profiles = listAccessibleNutritionProfiles(auth.principal.id);
    return NextResponse.json({
      profiles:
        auth.principal.role === 'child'
          ? profiles.filter((profile) => profile.id === auth.principal.nutritionProfileId)
          : profiles,
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal(request);
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
