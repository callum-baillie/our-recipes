import { authorizeApi, requireTrustedSessionMutation } from '@/lib/api-auth';
import { manageKitchenPhase, readKitchenInventory } from '@/lib/services/kitchen-inventory-service';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { getDatabase } from '@/lib/db/client';
import { kitchenResourceClaims } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, 'kitchen', 'read');
  if (auth.response) return auth.response;
  try {
    const kitchen = readKitchenInventory(auth.principal);
    return Response.json(
      {
        claims: getDatabase()
          .select()
          .from(kitchenResourceClaims)
          .where(eq(kitchenResourceClaims.kitchenId, kitchen.id))
          .all(),
      },
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
      manageKitchenPhase(auth.principal, await boundedDecisionJson(request, 65536)),
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
