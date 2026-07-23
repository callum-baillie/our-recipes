import { NextResponse } from 'next/server';

import { nutritionApiError, requireNutritionPrincipal } from '@/app/api/v1/nutrition/_shared';
import { getHouseholdNutritionComparison } from '@/lib/services/nutrition-comparison-service';

export async function GET() {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({
      comparison: getHouseholdNutritionComparison(auth.principal.id),
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}
