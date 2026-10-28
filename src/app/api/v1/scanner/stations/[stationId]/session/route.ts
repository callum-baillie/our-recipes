import { authorizeApi } from '@/lib/api-auth';
import { handleScanner } from '../../../_shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ stationId: string }> }) {
  const access = await authorizeApi(request, 'pantry', 'read');
  if (access.response) return access.response;
  return handleScanner(request, 'session', (await context.params).stationId, access);
}
