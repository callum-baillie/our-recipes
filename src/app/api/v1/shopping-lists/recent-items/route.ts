import { NextResponse } from 'next/server';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { recentShoppingItems } from '@/lib/services/shopping-shortcuts-service';
export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  return withApiRequestId(NextResponse.json({ items: recentShoppingItems() }), access.requestId);
}
