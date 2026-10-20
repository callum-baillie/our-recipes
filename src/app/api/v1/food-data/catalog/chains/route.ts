import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { listCatalogChains } from '@/lib/services/catalog-store-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../../_shared';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    return withApiRequestId(
      foodDataJson(await listCatalogChains(await readFoodDataJson(request))),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
