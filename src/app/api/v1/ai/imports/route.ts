import { NextResponse } from 'next/server';
import {
  decisionPrincipal,
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { importAiRecipeSet } from '@/lib/services/ai-bulk-import-service';
import { AiOperationError } from '@/lib/services/ai-operation-service';
import { AiSettingsValidationError } from '@/lib/services/ai-settings-service';
import { jsonError } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const principal = await decisionPrincipal(request);
    const job = await importAiRecipeSet(principal, await boundedDecisionJson(request, 13_000_000));
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    if (error instanceof AiOperationError)
      return jsonError(error.code === 'rate_limited' ? 429 : 400, error.code, error.message);
    if (error instanceof AiSettingsValidationError)
      return jsonError(403, 'ai_task_disabled', error.message);
    return decisionErrorResponse(error);
  }
}
