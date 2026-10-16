import { decisionPrincipal, decisionErrorResponse } from '@/lib/services/decision-request-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { z } from 'zod';
import { NextResponse } from 'next/server';

import { aiActionDecisionSchema } from '@/lib/domain/ai-assistant';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiActionConflictError,
  AiActionForbiddenError,
  AiActionNotFoundError,
  decideAiAction,
  getAiActionProposal,
} from '@/lib/services/ai-action-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ actionId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const parsed = aiActionDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_action_decision', 'Choose confirm or cancel.');
  try {
    const principal = await decisionPrincipal(request);
    const profileId =
      new URL(request.url).searchParams.get('personal') === 'true'
        ? principal.linkedProfileId
        : principal.profileId;
    const actionId = z.uuid().parse((await context.params).actionId);
    return NextResponse.json({
      action: await decideAiAction(
        actionId,
        profileId,
        parsed.data.decision,
        parsed.data.conflictResolutions,
      ),
    });
  } catch (error) {
    if (error instanceof DecisionError || error instanceof z.ZodError)
      return decisionErrorResponse(error);
    if (error instanceof AiActionNotFoundError)
      return jsonError(404, 'action_not_found', error.message);
    if (error instanceof AiActionForbiddenError)
      return jsonError(403, 'action_forbidden', error.message);
    if (error instanceof AiActionConflictError)
      return jsonError(409, 'action_conflict', error.message);
    throw error;
  }
}

export async function GET(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    const principal = await decisionPrincipal(request);
    const profileId =
      new URL(request.url).searchParams.get('personal') === 'true'
        ? principal.linkedProfileId
        : principal.profileId;
    const actionId = z.uuid().parse((await context.params).actionId);
    return NextResponse.json(
      { action: getAiActionProposal(actionId, profileId).action },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AiActionNotFoundError)
      return jsonError(404, 'action_not_found', error.message);
    if (error instanceof AiActionForbiddenError)
      return jsonError(403, 'action_forbidden', error.message);
    return decisionErrorResponse(error);
  }
}
