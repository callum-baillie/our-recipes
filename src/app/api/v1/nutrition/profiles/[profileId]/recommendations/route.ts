import { NextResponse } from 'next/server';
import {
  nutritionApiError,
  parseNutritionProfileId,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { getNutritionRecommendations } from '@/lib/services/nutrition-recommendation-service';
export async function GET(_request: Request, context: { params: Promise<{ profileId: string }> }) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    return NextResponse.json(
      { recommendations: getNutritionRecommendations(profileId, auth.principal.id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
