import { z } from 'zod';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import {
  prepareIdempotentMutation,
  readIdempotentMutationReplay,
  idempotentJsonResponse,
} from '@/lib/api-idempotency';
import { foodCatalogShoppingInputSchema } from '@/lib/domain/food-data';
import { PantryConflictError } from '@/lib/services/pantry-service';
import { confirmCatalogShoppingItem } from '@/lib/services/food-catalog-import-service';
import { foodDataApiError, readFoodDataJson } from '../../../food-data/_shared';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    const listId = z
      .string()
      .uuid()
      .parse((await context.params).listId);
    const raw = await readFoodDataJson(request);
    const input = foodCatalogShoppingInputSchema.parse(raw);
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
    const result = await confirmCatalogShoppingItem({
      input,
      listId,
      actorProfileId: access.principal.profileId,
      actorUserId: access.principal.userId,
      beforeCommit: () => {
        if (readIdempotentMutationReplay(prepared.context, access.requestId))
          throw new PantryConflictError(
            'This confirmation has already been resolved or closed. Inspect its original receipt.',
          );
      },
    });
    return idempotentJsonResponse(prepared.context, result, access.requestId, 201);
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
