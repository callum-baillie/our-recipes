import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { foodCatalogImportInputSchema } from '@/lib/domain/food-data';
import { importFoodCatalogRecord } from '@/lib/services/food-catalog-import-service';
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
    const { record } = await getFoodDetails(
      input.selection.provider,
      input.selection.recordId,
      'en',
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
