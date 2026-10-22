import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import {
  readCookingPreferences,
  saveCookingPreferences,
} from '@/lib/services/cooking-preferences-service';
export async function GET(request: Request) {
  const p = await getAuthenticatedSessionPrincipal(request);
  if (!p) return jsonError(401, 'sign_in_required', 'Sign in to view your preferences.');
  try {
    return Response.json(readCookingPreferences(p), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return decisionErrorResponse(e);
  }
}
export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin.');
  const p = await getAuthenticatedSessionPrincipal(request);
  if (!p) return jsonError(401, 'sign_in_required', 'Sign in to save your preferences.');
  try {
    return Response.json(saveCookingPreferences(p, await boundedDecisionJson(request)));
  } catch (e) {
    return decisionErrorResponse(e);
  }
}
