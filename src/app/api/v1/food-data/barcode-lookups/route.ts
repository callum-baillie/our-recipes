import { barcodeLookupInputSchema, FoodDataError } from '@/lib/domain/food-data';
import { lookupFoodByBarcode } from '@/lib/services/food-data-service';
import {
  foodDataApiError,
  foodDataJson,
  readFoodDataJson,
  rejectUntrustedFoodDataRequest,
  requireFoodDataActor,
} from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const rejected = rejectUntrustedFoodDataRequest(request);
  if (rejected) return rejected;
  const actor = await requireFoodDataActor();
  if (actor.response) return actor.response;
  try {
    const input = barcodeLookupInputSchema.parse(await readFoodDataJson(request));
    const result = await lookupFoodByBarcode(
      input.canonicalGtin,
      input.language,
      input.compareUsda,
    );
    if (!result.preferred && !result.localProduct)
      throw new FoodDataError('NOT_FOUND', 'No exact product was found for that barcode.');
    return foodDataJson(result);
  } catch (error) {
    return foodDataApiError(error);
  }
}
