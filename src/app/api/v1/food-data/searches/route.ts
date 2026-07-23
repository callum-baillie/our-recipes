import { foodSearchInputSchema } from '@/lib/domain/food-data';
import { searchFoodData } from '@/lib/services/food-data-service';
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
    const input = foodSearchInputSchema.parse(await readFoodDataJson(request));
    return foodDataJson(await searchFoodData(input.query, input.page, input.kind));
  } catch (error) {
    return foodDataApiError(error);
  }
}
