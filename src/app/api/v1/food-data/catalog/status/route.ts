import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { getCatalogStatus } from '@/lib/services/bord-catalog-service';
import { foodDataJson } from '../../_shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  return withApiRequestId(foodDataJson(await getCatalogStatus()), access.requestId);
}
