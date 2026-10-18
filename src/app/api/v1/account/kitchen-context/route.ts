import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { readKitchenContext, updateKitchenContext } from '@/lib/services/kitchen-context-service';
export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'sign_in_required', 'Sign in to view your kitchen context.');
  try {
    return Response.json(readKitchenContext(principal.linkedProfileId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin.');
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'sign_in_required', 'Sign in to update your kitchen context.');
  try {
    return Response.json(
      updateKitchenContext(principal.linkedProfileId, await boundedDecisionJson(request)),
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
