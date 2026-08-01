import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { pantryBatchActionSchema } from '@/lib/domain/pantry';
import { pantryBatchUpdateSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import {
  applyPantryBatchAction,
  getPantryBatch,
  updatePantryBatch,
} from '@/lib/services/pantry-service';

import { pantryServiceError } from '../../_shared';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const authorization = await authorizeApi(request, 'pantry', 'read');
  if (authorization.response) return authorization.response;
  const batch = getPantryBatch((await context.params).batchId);
  return batch
    ? withApiRequestId(NextResponse.json({ batch }), authorization.requestId)
    : jsonError(404, 'pantry_not_found', 'That Pantry item no longer exists.');
}

export async function PATCH(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const authorization = await authorizeApi(request, 'pantry', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = pantryBatchUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_batch', 'Check the Pantry item details and try again.');
  try {
    return withApiRequestId(
      NextResponse.json({
        batch: updatePantryBatch(
          (await context.params).batchId,
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

export async function DELETE(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const authorization = await authorizeApi(request, 'pantry', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const expectedVersion = Number(new URL(request.url).searchParams.get('expectedVersion'));
  const parsed = pantryBatchActionSchema.safeParse({
    type: 'discard',
    expectedVersion,
    reason: 'Removed through API',
    note: '',
  });
  if (!parsed.success) {
    return jsonError(
      400,
      'expected_version_required',
      'Provide the current expectedVersion before removing Pantry stock.',
    );
  }
  try {
    const batch = applyPantryBatchAction(
      (await context.params).batchId,
      parsed.data,
      authorization.principal.profileId,
    );
    return withApiRequestId(NextResponse.json({ batch }), authorization.requestId);
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
