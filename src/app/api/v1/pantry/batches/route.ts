import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { idempotentJsonResponse, prepareIdempotentMutation } from '@/lib/api-idempotency';
import { pantryBatchInputSchema, pantryQuerySchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { createPantryBatch, getPantryDashboard } from '@/lib/services/pantry-service';

import { pantryServiceError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'pantry', 'read');
  if (authorization.response) return authorization.response;
  const parsed = pantryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return jsonError(400, 'invalid_pantry_query', 'Use valid Pantry filters.');
  return withApiRequestId(
    NextResponse.json({ batches: getPantryDashboard(parsed.data).batches }),
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
  const parsed = pantryBatchInputSchema.safeParse(idempotency.context.body);
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_pantry_batch',
      'Enter a product, location, and an exact or approximate quantity.',
    );
  try {
    return idempotentJsonResponse(
      idempotency.context,
      {
        batch: createPantryBatch(parsed.data, authorization.principal.profileId),
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
