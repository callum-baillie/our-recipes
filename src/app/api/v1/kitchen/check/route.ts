import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import { previewKitchenPlan } from '@/lib/services/kitchen-inventory-service';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
export async function POST(request: Request) {
  const auth = await authorizeApi(request, 'kitchen', 'read');
  if (auth.response) return auth.response;
  const origin = requireTrustedSessionMutation(request, auth.principal, auth.requestId);
  if (origin) return origin;
  try {
    return Response.json({
      plan: previewKitchenPlan(auth.principal, await boundedDecisionJson(request, 65536)),
    });
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
