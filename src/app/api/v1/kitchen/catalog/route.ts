import { authorizeApi } from '@/lib/api-auth';
import { kitchenCatalog } from '@/lib/services/kitchen-inventory-service';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, 'kitchen', 'read');
  if (auth.response) return auth.response;
  try {
    return Response.json(kitchenCatalog(auth.principal));
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
