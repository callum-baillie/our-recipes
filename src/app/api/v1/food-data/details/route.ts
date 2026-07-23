import { foodDetailsInputSchema } from '@/lib/domain/food-data';
import { getFoodDetails } from '@/lib/services/food-data-service';
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
    const input = foodDetailsInputSchema.parse(await readFoodDataJson(request));
    return foodDataJson(await getFoodDetails(input.provider, input.recordId, input.language));
  } catch (error) {
    return foodDataApiError(error);
  }
}
