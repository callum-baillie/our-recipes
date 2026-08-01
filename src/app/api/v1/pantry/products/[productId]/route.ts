import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { pantryProductUpdateSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import {
  archivePantryProduct,
  getPantryProduct,
  updatePantryProduct,
} from '@/lib/services/pantry-service';

import { pantryServiceError } from '../../_shared';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
  const authorization = await authorizeApi(request, 'pantry', 'read');
  if (authorization.response) return authorization.response;
  const product = getPantryProduct((await context.params).productId);
  return product
    ? withApiRequestId(NextResponse.json({ product }), authorization.requestId)
    : jsonError(404, 'pantry_not_found', 'That Pantry product no longer exists.');
}

export async function PATCH(request: Request, context: { params: Promise<{ productId: string }> }) {
  const authorization = await authorizeApi(request, 'pantry', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = pantryProductUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_pantry_product',
      'Check the product name, units, and stock targets.',
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        product: updatePantryProduct(
          (await context.params).productId,
          parsed.data,
          authorization.principal.profileId,
        ),
      }),
      authorization.requestId,
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const authorization = await authorizeApi(request, 'pantry', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  try {
    const product = archivePantryProduct(
      (await context.params).productId,
      authorization.principal.profileId,
    );
    return withApiRequestId(NextResponse.json({ product }), authorization.requestId);
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
