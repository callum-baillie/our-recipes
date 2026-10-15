import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { barcodeLookupInputSchema, FoodDataError } from '@/lib/domain/food-data';
import { lookupFoodByBarcode } from '@/lib/services/food-data-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  try {
    const input = barcodeLookupInputSchema.parse(await readFoodDataJson(request));
    const result = await lookupFoodByBarcode(
      input.canonicalGtin,
      input.language,
      input.compareUsda,
    );
    if (!result.preferred && !result.localProduct)
      throw new FoodDataError('NOT_FOUND', 'No exact product was found for that barcode.');
    return withApiRequestId(foodDataJson(result), access.requestId);
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
