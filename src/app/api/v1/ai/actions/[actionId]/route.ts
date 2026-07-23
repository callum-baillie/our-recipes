import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { aiActionDecisionSchema } from '@/lib/domain/ai-assistant';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiActionConflictError,
  AiActionForbiddenError,
  AiActionNotFoundError,
  decideAiAction,
} from '@/lib/services/ai-action-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ actionId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const profileId = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = aiActionDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_action_decision', 'Choose confirm or cancel.');
  try {
    return NextResponse.json({
      action: await decideAiAction(
        (await context.params).actionId,
        profileId,
        parsed.data.decision,
        parsed.data.conflictResolutions,
      ),
    });
  } catch (error) {
    if (error instanceof AiActionNotFoundError)
      return jsonError(404, 'action_not_found', error.message);
    if (error instanceof AiActionForbiddenError)
      return jsonError(403, 'action_forbidden', error.message);
    if (error instanceof AiActionConflictError)
      return jsonError(409, 'action_conflict', error.message);
    throw error;
  }
}
