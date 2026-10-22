import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { changeCookingEpisode, readCookingEpisode } from '@/lib/services/cooking-episode-service';
export const runtime = 'nodejs';
type Context = { params: Promise<{ sessionId: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await authorizeApi(request, 'recipes', request.method === 'GET' ? 'read' : 'update');
  if (auth.response) return auth.response;
  try {
    return Response.json(readCookingEpisode(auth.principal, (await context.params).sessionId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeApi(request, 'recipes', request.method === 'GET' ? 'read' : 'update');
  if (auth.response) return auth.response;
  const origin = requireTrustedSessionMutation(request, auth.principal, auth.requestId);
  if (origin) return origin;
  try {
    return Response.json(
      changeCookingEpisode(
        auth.principal,
        (await context.params).sessionId,
        await boundedDecisionJson(request, 65536),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
