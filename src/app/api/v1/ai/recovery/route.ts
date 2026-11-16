import { jsonError } from '@/lib/http';
import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { AiRecoveryError, listAiRecoveryRequests } from '@/lib/services/ai-recovery-service';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const principal = await personalAiPrincipal(request, false);
    const id = new URL(request.url).searchParams.get('threadId');
    if (id) z.string().uuid().parse(id);
    return Response.json(
      { requests: listAiRecoveryRequests(principal, id ?? undefined) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AiRecoveryError)
      return jsonError(403, 'approval_not_allowed', error.message);
    return decisionErrorResponse(error);
  }
}
