import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { canAccountUseAi } from '@/lib/services/ai-access-service';
import { appRoleCan } from '@/lib/domain/permissions';
import { NextResponse } from 'next/server';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiAssistantProviderResponseError,
  AiAssistantProviderUnavailableError,
} from '@/lib/providers/ai-assistant-provider';
import {
  aiSummaryUnavailableReason,
  aiSummaryAvailability,
  AiSummaryInProgressError,
  listAiSummaries,
  refreshAiSummaryBundle,
} from '@/lib/services/ai-summary-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'authentication_required', 'Sign in to read your summaries.');
  if (
    !appRoleCan(principal.accountRole, 'personal.read') ||
    principal.profileId !== principal.linkedProfileId
  )
    return jsonError(
      403,
      'personal_scope_required',
      'Switch to your own profile to read your saved AI summaries.',
    );
  const actor = principal.linkedProfileId;
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 12);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return jsonError(400, 'invalid_limit', 'Limit must be an integer between 1 and 50.');
  }
  return NextResponse.json(
    { summaries: listAiSummaries(actor, limit) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const scope = new URL(request.url).searchParams.get('scope');
  if (scope && scope !== 'account')
    return jsonError(
      400,
      'invalid_summary_scope',
      'Summaries are scoped to your signed-in account.',
    );
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'authentication_required', 'Sign in to update your summaries.');
  const actor = principal.linkedProfileId;
  if (!canAccountUseAi(principal.userId))
    return jsonError(
      403,
      'ai_disabled',
      'AI is disabled for this account. Review AI preferences or ask an administrator.',
    );
  try {
    const summaries = await refreshAiSummaryBundle(actor);
    return NextResponse.json(
      {
        summaries,
        availability: aiSummaryAvailability(actor),
        recipient: {
          id: actor,
          name:
            getHouseholdState().profiles.find((profile) => profile.id === actor)?.displayName ??
            'Your profile',
        },
        outcome: summaries.length
          ? 'updated'
          : (aiSummaryUnavailableReason(actor) ?? 'no_eligible_evidence'),
      },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AiSummaryInProgressError)
      return jsonError(409, 'summary_in_progress', error.message);
    if (error instanceof AiAssistantProviderUnavailableError)
      return jsonError(503, 'ai_not_configured', error.message);
    if (error instanceof AiAssistantProviderResponseError)
      return jsonError(502, 'ai_request_failed', error.message);
    throw error;
  }
}
