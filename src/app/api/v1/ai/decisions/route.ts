import { z } from 'zod';
import { predictionHistory } from '@/lib/services/prediction-history-service';
import { withAiExecutionContext } from '@/lib/services/ai-execution-context';
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
    const p = await decisionPrincipal(request);
    const query = z
      .object({
        history: z.enum(['true']).optional(),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(
      query.history ? predictionHistory(p, query.offset) : decisionWorkspace(p),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const p = await decisionPrincipal(request);
    const input = decisionRequestSchema.parse(await boundedDecisionJson(request));
    return Response.json(
      await withAiExecutionContext({ signal: request.signal }, () =>
        runDecisionAssistance(p, input),
      ),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
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
