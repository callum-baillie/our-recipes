import { NextResponse } from 'next/server';

import {
  nutritionApiError,
  parseNutritionProfileId,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { nutritionRecommendationFeedbackSchema } from '@/lib/domain/nutrition-recommendations';
import { appendNutritionRecommendationFeedback } from '@/lib/services/nutrition-recommendation-service';

type Context = {
  params: Promise<{ profileId: string; recommendationKey: string }>;
};

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const params = await context.params;
    const profileId = parseNutritionProfileId(params.profileId);
    const input = nutritionRecommendationFeedbackSchema.parse(await readJson(request));
    return NextResponse.json(
      {
        feedback: appendNutritionRecommendationFeedback(
          profileId,
          auth.actor,
          params.recommendationKey,
          input,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
