import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { prepareIdempotentMutation, executeIdempotentMutation } from '@/lib/api-idempotency';
import { z } from 'zod';
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
    const raw = await readFoodDataJson(request);
    const input = inputSchema.parse(raw);
    const prepared = await prepareIdempotentMutation(
      new Request(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.operationId },
        body: JSON.stringify(raw),
      }),
      access.principal,
      access.requestId,
    );
    if (prepared.response) return prepared.response;
    const { batches, ...catalogInput } = input;
    const replay = replayFoodCatalogImport(
      catalogInput,
      'pantry',
      actor.profileId,
      input.batches,
      access.principal.userId,
    );
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
    return executeIdempotentMutation(
      prepared.context,
      () =>
        importFoodCatalogRecord({
          input: catalogInput,
          record,
          actorProfileId: actor.profileId,
          actorUserId: access.principal.userId,
          destination: 'pantry',
          batches,
        }),
      access.requestId,
      201,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
