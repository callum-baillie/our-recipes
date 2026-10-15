import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { foodSearchInputSchema } from '@/lib/domain/food-data';
import { searchFoodData } from '@/lib/services/food-data-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  try {
    const input = foodSearchInputSchema.parse(await readFoodDataJson(request));
    return withApiRequestId(
      foodDataJson(await searchFoodData(input.query, input.page, input.kind)),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
