import { auth } from '@/lib/auth/server';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const blockedPrefixes = [
  '/api/auth/sign-up',
  '/api/auth/admin',
  '/api/auth/api-key',
  '/api/auth/delete-user',
  '/api/auth/change-email',
];

async function handle(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (blockedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return jsonError(404, 'auth_route_not_found', 'That authentication route is not available.');
  }
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
