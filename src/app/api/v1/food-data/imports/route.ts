import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { FoodDataError, foodCatalogImportInputSchema } from '@/lib/domain/food-data';
import {
  importFoodCatalogRecord,
  replayFoodCatalogImport,
} from '@/lib/services/food-catalog-import-service';
import {
  isNativeCatalogEnabled,
  directFoodFallbackAllowed,
} from '@/lib/services/bord-catalog-service';
import { getFoodDetails } from '@/lib/services/food-data-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  try {
    const input = foodCatalogImportInputSchema.parse(await readFoodDataJson(request));
    const replay = replayFoodCatalogImport(input, 'catalog');
    if (replay) return withApiRequestId(foodDataJson(replay, { status: 201 }), access.requestId);
    if (isNativeCatalogEnabled() && !directFoodFallbackAllowed() && !input.selection.catalogRef)
      throw new FoodDataError(
        'REVISION_EXPIRED',
        'Review this food through the catalog before saving.',
      );
    const { record } = await getFoodDetails(
      input.selection.provider,
      input.selection.recordId,
      'en',
      input.selection.catalogRef,
      true,
    );
    return withApiRequestId(
      foodDataJson(
        importFoodCatalogRecord({
          input,
          record,
          actorProfileId: actor.profileId,
          destination: 'catalog',
        }),
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
