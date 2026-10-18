import { canAccountUseAi } from '@/lib/services/ai-access-service';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiJobForbiddenError,
  AiJobNotFoundError,
  AiJobStateError,
  cancelAiJob,
  getAiJob,
  retryAiJob,
} from '@/lib/services/ai-job-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const commandSchema = z.object({ command: z.enum(['cancel', 'retry']) }).strict();

function errorResponse(error: unknown) {
  if (error instanceof AiJobNotFoundError) return jsonError(404, 'job_not_found', error.message);
  if (error instanceof AiJobForbiddenError) return jsonError(403, 'job_forbidden', error.message);
  if (error instanceof AiJobStateError) return jsonError(409, 'job_state_conflict', error.message);
  throw error;
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  const actor = principal?.linkedProfileId ?? null;
  if (!actor)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    return NextResponse.json({
      job: getAiJob((await context.params).jobId, actor, principal!.userId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const principal = await getAuthenticatedSessionPrincipal(request);
  const actor = principal?.linkedProfileId ?? null;
  if (!actor)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_job_command', 'Choose cancel or retry.');
  if (
    parsed.data.command === 'retry' &&
    principal &&
    (!canAccountUseAi(principal.userId) || principal.profileId !== principal.linkedProfileId)
  )
    return jsonError(403, 'ai_disabled', 'AI is disabled or requires your own account profile.');
  try {
    const jobId = (await context.params).jobId;
    getAiJob(jobId, actor, principal!.userId);
    const job =
      parsed.data.command === 'cancel' ? await cancelAiJob(jobId, actor) : retryAiJob(jobId, actor);
    return NextResponse.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
