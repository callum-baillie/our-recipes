import { withAiExecutionContext } from '@/lib/services/ai-execution-context';
import { storeMapRequestSchema, storeMapCorrectionSchema } from '@/lib/domain/store-map';
import {
  decisionPrincipal,
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { suggestStoreMap, correctStoreMap } from '@/lib/services/store-map-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const p = await decisionPrincipal(request);
    const input = storeMapRequestSchema.parse(await boundedDecisionJson(request, 8_410_000));
    return Response.json(
      await withAiExecutionContext({ signal: request.signal }, () => suggestStoreMap(p, input)),
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
    const input = storeMapCorrectionSchema.parse(await boundedDecisionJson(request, 40_000));
    return Response.json(correctStoreMap(p, input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
