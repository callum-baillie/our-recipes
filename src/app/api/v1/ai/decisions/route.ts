import { decisionRequestSchema, decisionFeedbackSchema } from '@/lib/domain/decision-assistance';
import {
  decisionPrincipal,
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { decisionWorkspace } from '@/lib/services/decision-jobs-service';
import {
  runDecisionAssistance,
  decisionFeedback,
} from '@/lib/services/decision-assistance-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    return Response.json(decisionWorkspace(await decisionPrincipal(request)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const p = await decisionPrincipal(request);
    const input = decisionRequestSchema.parse(await boundedDecisionJson(request));
    return Response.json(await runDecisionAssistance(p, input), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const p = await decisionPrincipal(request);
    const input = decisionFeedbackSchema.parse(await boundedDecisionJson(request));
    return Response.json(await decisionFeedback(p, input), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
