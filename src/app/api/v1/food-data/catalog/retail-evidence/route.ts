import { z } from 'zod';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';
import { foodDataApiError, foodDataJson, readFoodDataJson } from '../../_shared';
const schema = z
  .object({ productId: z.string().min(1).max(160), storeId: z.string().min(1).max(160).optional() })
  .strict();
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  try {
    const input = schema.parse(await readFoodDataJson(request));
    const result = await new BordCatalogClient().retailEvidence(input.productId, input.storeId);
    // Do not present historical chain evidence as current branch stock.
    return withApiRequestId(
      foodDataJson({ evidence: result.data, generation: result.meta.catalog_generation }),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
