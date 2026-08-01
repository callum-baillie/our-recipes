import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { idempotentJsonResponse, prepareIdempotentMutation } from '@/lib/api-idempotency';
import { pantryProductInputSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { createPantryProduct, listPantryProducts } from '@/lib/services/pantry-service';

import { pantryServiceError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'pantry', 'read');
  if (authorization.response) return authorization.response;
  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  return withApiRequestId(
    NextResponse.json({ products: listPantryProducts(includeArchived) }),
    authorization.requestId,
  );
}

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
  const parsed = pantryProductInputSchema.safeParse(idempotency.context.body);
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_pantry_product',
      'Check the product name, units, and stock targets.',
    );
  try {
    return idempotentJsonResponse(
      idempotency.context,
      {
        product: createPantryProduct(parsed.data, authorization.principal.profileId),
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
