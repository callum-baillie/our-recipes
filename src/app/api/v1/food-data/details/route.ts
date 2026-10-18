import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { foodDetailsInputSchema } from '@/lib/domain/food-data';
import { getFoodDetails } from '@/lib/services/food-data-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  try {
    const input = foodDetailsInputSchema.parse(await readFoodDataJson(request));
    return withApiRequestId(
      foodDataJson(
        await getFoodDetails(input.provider, input.recordId, input.language, input.catalogRef),
      ),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
