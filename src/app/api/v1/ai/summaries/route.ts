import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { aiSummaryKindSchema } from '@/lib/domain/ai-assistant';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiAssistantProviderResponseError,
  AiAssistantProviderUnavailableError,
} from '@/lib/providers/ai-assistant-provider';
import { generateAiSummary, listAiSummaries } from '@/lib/services/ai-summary-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function profileId() {
  return getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
}

export async function GET(request: Request) {
  const actor = await profileId();
  if (!actor)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 12);
  return NextResponse.json({
    summaries: listAiSummaries(actor, Number.isFinite(limit) ? limit : 12),
  });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = await profileId();
  if (!actor)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = aiSummaryKindSchema.safeParse((await request.json().catch(() => null))?.kind);
  if (!parsed.success)
    return jsonError(400, 'invalid_summary_kind', 'Choose a valid summary type.');
  try {
    const summary = await generateAiSummary(actor, parsed.data);
    return NextResponse.json({ summary }, { status: 201 });
  } catch (error) {
    if (error instanceof AiAssistantProviderUnavailableError)
      return jsonError(503, 'ai_not_configured', error.message);
    if (error instanceof AiAssistantProviderResponseError)
      return jsonError(502, 'ai_request_failed', error.message);
    throw error;
  }
}
