import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import {
  changeCookingSessionRecipe,
  readCookingSessionRecipe,
} from '@/lib/services/cooking-session-recipe-service';
export const runtime = 'nodejs';
type Context = { params: Promise<{ sessionId: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await authorizeApi(request, 'recipes', request.method === 'GET' ? 'read' : 'update');
  if (auth.response) return auth.response;
  try {
    return Response.json(
      { session: readCookingSessionRecipe(auth.principal, (await context.params).sessionId) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
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
      changeCookingSessionRecipe(
        auth.principal,
        (await context.params).sessionId,
        await boundedDecisionJson(request, 131072),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
