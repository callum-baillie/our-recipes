import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import { executeIdempotentMutation, prepareIdempotentMutation } from '@/lib/api-idempotency';
import { normalizeGtin } from '@/lib/domain/food-data';
import { pantryBatchInputSchema, pantryProductInputSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { createPantryProductForBarcode } from '@/lib/services/pantry-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

import { pantryServiceError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The batch is validated like any other, with a stand-in product id the service replaces. */
const PLACEHOLDER_PRODUCT_ID = '00000000-0000-4000-8000-000000000000';

/** Name a barcode no catalog knows and add its first stock together. */
export async function POST(request: Request) {
  const authorization = await authorizeApi(request, 'pantry', 'create');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const idempotency = await prepareIdempotentMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (idempotency.response) return idempotency.response;
  const body = idempotency.context.body as {
    barcode?: unknown;
    product?: unknown;
    batch?: unknown;
  } | null;
  const product = pantryProductInputSchema.safeParse(body?.product);
  const batch = pantryBatchInputSchema.safeParse({
    ...(body?.batch as object),
    productId: PLACEHOLDER_PRODUCT_ID,
  });
  if (typeof body?.barcode !== 'string' || !product.success || !batch.success)
    return jsonError(
      400,
      'invalid_barcode_product',
      'Enter a barcode, a product name, a location and a quantity.',
    );
  try {
    normalizeGtin(body.barcode);
  } catch {
    return jsonError(400, 'invalid_barcode', 'This is not a valid retail barcode.');
  }
  try {
    return executeIdempotentMutation(
      idempotency.context,
      () => {
        const stock: Partial<typeof batch.data> = { ...batch.data };
        delete stock.productId;
        const saved = createPantryProductForBarcode(
          {
            barcode: body.barcode as string,
            product: product.data,
            batch: stock as Omit<typeof batch.data, 'productId'>,
          },
          authorization.principal.profileId,
        );
        reconcileAutomaticRestockPolicies(authorization.principal.profileId);
        return saved;
      },
      authorization.requestId,
      201,
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
