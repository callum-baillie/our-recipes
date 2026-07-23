import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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

async function actorProfileId() {
  return getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
}

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const profileId = await actorProfileId();
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    return NextResponse.json(
      getCookSessionPantryPreview((await context.params).sessionId, profileId),
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return jsonError(404, 'cook_session_not_found', error.message);
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const profileId = await actorProfileId();
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = allocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_preview', 'Use a valid product, quantity, and unit.');
  try {
    getCookSessionPantryPreview((await context.params).sessionId, profileId);
    return NextResponse.json(
      previewPantryProductConsumption(
        parsed.data.productId,
        parsed.data.quantity,
        parsed.data.unit,
      ),
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError || error instanceof PantryNotFoundError)
      return jsonError(404, 'pantry_preview_not_found', error.message);
    if (error instanceof PantryValidationError)
      return jsonError(400, 'invalid_pantry_preview', error.message);
    throw error;
  }
}
