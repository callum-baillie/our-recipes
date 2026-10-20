import { z } from 'zod';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { confirmCatalogShoppingItem } from '@/lib/services/food-catalog-import-service';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../../../food-data/_shared';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    const listId = z
      .string()
      .uuid()
      .parse((await context.params).listId);
    const result = await confirmCatalogShoppingItem({
      input: await readFoodDataJson(request),
      listId,
      actorProfileId: access.principal.profileId,
      actorUserId: access.principal.userId,
    });
    return withApiRequestId(foodDataJson(result, { status: 201 }), access.requestId);
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
