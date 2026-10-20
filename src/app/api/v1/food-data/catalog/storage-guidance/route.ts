import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { searchStorageGuidance } from '@/lib/services/catalog-food-context-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../../_shared';
export const runtime = 'nodejs';
/** Read-only despite POST: no product, cart, stock, purchase or intake is created. */
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    return withApiRequestId(
      foodDataJson(await searchStorageGuidance(await readFoodDataJson(request))),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
