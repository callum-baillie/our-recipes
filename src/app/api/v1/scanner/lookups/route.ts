import { authorizeCoreApi } from '@/lib/api-auth';
import { handleScanner } from '../_shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  return handleScanner(request, 'lookup', '', access);
}
