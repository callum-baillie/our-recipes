import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { importConfirmationSchema } from '@/lib/domain/import';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  ImportNotFoundError,
  ImportStateError,
  confirmImportOperation,
} from '@/lib/services/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      403,
      'untrusted_origin',
      'This confirmation must come from a trusted app origin.',
    );
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before adding this reviewed recipe.',
    );
  }
  const parsed = importConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_recipe', 'Check the reviewed recipe details.');
  try {
    const { importId } = await context.params;
    return NextResponse.json(
      confirmImportOperation(importId, parsed.data.recipe, actor.profileId),
      {
        status: 201,
      },
    );
  } catch (error) {
    if (error instanceof ImportNotFoundError)
      return jsonError(404, 'import_not_found', error.message);
    if (error instanceof ImportStateError)
      return jsonError(409, 'import_already_confirmed', error.message);
    throw error;
  }
}
