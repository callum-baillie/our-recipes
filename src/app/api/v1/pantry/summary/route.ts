import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryQuerySchema } from '@/lib/domain/pantry';
import { getPantryDashboard } from '@/lib/services/pantry-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = pantryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return withApiRequestId(
      NextResponse.json(
        { error: { code: 'invalid_pantry_query', message: 'Use valid Pantry filters.' } },
        { status: 400 },
      ),
      access.requestId,
    );
  return withApiRequestId(
    NextResponse.json({ dashboard: getPantryDashboard(parsed.data) }),
    access.requestId,
  );
}
