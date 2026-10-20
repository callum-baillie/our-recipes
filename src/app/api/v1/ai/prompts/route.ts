import { adminAuthError } from '@/app/api/v1/admin/api-keys/_shared';
import { requireAdminSession } from '@/lib/services/auth-service';
import { hasTrustedMutationOrigin } from '@/lib/http';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { z } from 'zod';
import { aiWorkloadSchema } from '@/lib/domain/ai-assistant';
import {
  getPromptHistory,
  getPromptAdministration,
  savePrompt,
} from '@/lib/services/ai-prompt-service';
export const runtime = 'nodejs';
async function admin(request: Request) {
  if (request.method !== 'GET' && !hasTrustedMutationOrigin(request))
    throw new DecisionError('Use a trusted app origin.', 403);
  const p = await requireAdminSession(request, { fresh: false });
  return p;
}
export async function GET(request: Request) {
  try {
    await admin(request);
    const url = new URL(request.url);
    if (url.searchParams.has('workload')) {
      const workload = aiWorkloadSchema.parse(url.searchParams.get('workload'));
      const before = url.searchParams.has('before')
        ? z.coerce.number().int().positive().parse(url.searchParams.get('before'))
        : undefined;
      const history = getPromptHistory(workload, before);
      return Response.json(
        { history, nextBefore: history.length === 10 ? history.at(-1)!.version : null },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      { prompts: getPromptAdministration() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const response = adminAuthError(error);
    return response ?? decisionErrorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const p = await admin(request);
    return Response.json(
      { prompt: savePrompt(p, await boundedDecisionJson(request)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const response = adminAuthError(error);
    return response ?? decisionErrorResponse(error);
  }
}
