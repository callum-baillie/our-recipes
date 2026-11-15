import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { listShoppingTrips, recordShoppingTrip } from '@/lib/services/shopping-trip-service';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, 'shoppingLists', 'read');
  if (auth.response) return auth.response;
  return Response.json(
    { trips: listShoppingTrips(auth.principal) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request, 'shoppingLists', 'create');
  if (auth.response) return auth.response;
  const originError = requireTrustedSessionMutation(request, auth.principal, auth.requestId);
  if (originError) return originError;
  try {
    return Response.json(
      { trip: recordShoppingTrip(auth.principal, await boundedDecisionJson(request)) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
