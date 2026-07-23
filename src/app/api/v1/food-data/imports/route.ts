import { foodCatalogImportInputSchema } from '@/lib/domain/food-data';
import { importFoodCatalogRecord } from '@/lib/services/food-catalog-import-service';
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
    const input = foodCatalogImportInputSchema.parse(await readFoodDataJson(request));
    const { record } = await getFoodDetails(
      input.selection.provider,
      input.selection.recordId,
      'en',
    );
    return foodDataJson(
      importFoodCatalogRecord({
        input,
        record,
        actorProfileId: actor.profileId,
        destination: 'catalog',
      }),
      { status: 201 },
    );
  } catch (error) {
    return foodDataApiError(error);
  }
}
