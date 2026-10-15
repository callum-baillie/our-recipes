import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { z } from 'zod';
import { foodCatalogImportInputSchema } from '@/lib/domain/food-data';
import { importFoodCatalogRecord } from '@/lib/services/food-catalog-import-service';
import { getFoodDetails } from '@/lib/services/food-data-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../../food-data/_shared';

const inputSchema = foodCatalogImportInputSchema
  .extend({
    batches: z.array(z.unknown()).min(1).max(20),
  })
  .strict();
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  try {
    const input = inputSchema.parse(await readFoodDataJson(request));
    const { record } = await getFoodDetails(
      input.selection.provider,
      input.selection.recordId,
      'en',
    );
    const { batches, ...catalogInput } = input;
    return withApiRequestId(
      foodDataJson(
        importFoodCatalogRecord({
          input: catalogInput,
          record,
          actorProfileId: actor.profileId,
          destination: 'pantry',
          batches,
        }),
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
