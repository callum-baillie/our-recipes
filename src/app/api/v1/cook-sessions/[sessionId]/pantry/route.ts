import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { jsonError } from '@/lib/http';
import {
  getCookSessionPantryPreview,
  PantryGroceryCookingNotFoundError,
} from '@/lib/services/pantry-grocery-cooking-service';
import {
  PantryNotFoundError,
  PantryValidationError,
  previewPantryProductConsumption,
} from '@/lib/services/pantry-service';

export const runtime = 'nodejs';

const allocationSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(30),
  })
  .strict();

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  const profileId = access.principal.profileId;
  if (!profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(getCookSessionPantryPreview((await context.params).sessionId, profileId)),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return withApiRequestId(
        jsonError(404, 'cook_session_not_found', error.message),
        access.requestId,
      );
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const profileId = access.principal.profileId;
  if (!profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = allocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_preview', 'Use a valid product, quantity, and unit.'),
      access.requestId,
    );
  try {
    getCookSessionPantryPreview((await context.params).sessionId, profileId);
    return withApiRequestId(
      NextResponse.json(
        previewPantryProductConsumption(
          parsed.data.productId,
          parsed.data.quantity,
          parsed.data.unit,
        ),
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError || error instanceof PantryNotFoundError)
      return withApiRequestId(
        jsonError(404, 'pantry_preview_not_found', error.message),
        access.requestId,
      );
    if (error instanceof PantryValidationError)
      return withApiRequestId(
        jsonError(400, 'invalid_pantry_preview', error.message),
        access.requestId,
      );
    throw error;
  }
}
