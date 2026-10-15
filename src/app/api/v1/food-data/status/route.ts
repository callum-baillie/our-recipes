import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { foodDataJson } from '../_shared';
import { listFoodProviderStatuses } from '@/lib/services/food-data-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  return withApiRequestId(
    foodDataJson({
      providers: listFoodProviderStatuses(),
      camera: { requiresSecureContext: true, permissionPolicy: 'camera=(self)' },
    }),
    access.requestId,
  );
}
