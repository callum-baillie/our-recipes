import {
  nutritionApiError,
  parseNutritionProfileId,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { exportPrivateNutritionProfile } from '@/lib/services/nutrition-diary-lifecycle-service';

type Context = { params: Promise<{ profileId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const profileId = parseNutritionProfileId((await context.params).profileId);
    const payload = exportPrivateNutritionProfile(profileId, auth.principal.id);
    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="nutrition-${profileId}.json"`,
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return nutritionApiError(error);
  }
}
