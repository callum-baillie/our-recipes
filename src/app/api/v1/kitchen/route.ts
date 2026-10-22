import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import {
  executeKitchenCommand,
  readKitchenInventory,
} from '@/lib/services/kitchen-inventory-service';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, 'kitchen', 'read');
  if (auth.response) return auth.response;
  try {
    return Response.json(
      { kitchen: readKitchenInventory(auth.principal) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request, 'kitchen', 'update');
  if (auth.response) return auth.response;
  const origin = requireTrustedSessionMutation(request, auth.principal, auth.requestId);
  if (origin) return origin;
  try {
    return Response.json(
      executeKitchenCommand(auth.principal, await boundedDecisionJson(request, 65536)),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
