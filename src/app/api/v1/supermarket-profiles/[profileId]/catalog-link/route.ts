import { z } from 'zod';
import { authorizeCoreApi, actorFromPrincipal, withApiRequestId } from '@/lib/api-auth';
import { storeLinkInputSchema } from '@/lib/domain/bord-catalog';
import { jsonError } from '@/lib/http';
import { linkCatalogStore, reviewCatalogStore } from '@/lib/services/catalog-store-service';
import {
  ListSettingsConflictError,
  ListSettingsNotFoundError,
  setSupermarketCatalogLink,
} from '@/lib/services/list-settings-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../../../food-data/_shared';
export const runtime = 'nodejs';
type Context = { params: Promise<{ profileId: string }> };
async function handle(request: Request, context: Context) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    const id = z
      .string()
      .uuid()
      .parse((await context.params).profileId);
    const actor = actorFromPrincipal(access.principal);
    let result;
    if (request.method === 'GET') result = await reviewCatalogStore(id);
    else if (request.method === 'DELETE')
      result = setSupermarketCatalogLink(id, null, actor.profileId);
    else {
      const input = storeLinkInputSchema.parse(await readFoodDataJson(request));
      result = await linkCatalogStore(id, input.storeId, input.revision, actor.profileId);
    }
    return withApiRequestId(foodDataJson(result), access.requestId);
  } catch (error) {
    const response =
      error instanceof ListSettingsNotFoundError
        ? jsonError(404, 'supermarket_not_found', error.message)
        : error instanceof ListSettingsConflictError
          ? jsonError(409, 'supermarket_conflict', error.message)
          : foodDataApiError(error);
    return withApiRequestId(response, access.requestId);
  }
}
export async function GET(request: Request, context: Context) {
  return handle(request, context);
}
export async function PATCH(request: Request, context: Context) {
  return handle(request, context);
}
export async function DELETE(request: Request, context: Context) {
  return handle(request, context);
}
