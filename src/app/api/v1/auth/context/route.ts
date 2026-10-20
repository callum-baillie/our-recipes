import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { jsonError } from '@/lib/http';

export const dynamic = 'force-dynamic';
/** Minimal account/actor binding for a reviewed native operation; no credentials or private profile fields. */
export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'authentication_required', 'Sign in to review this operation.');
  return Response.json(
    { actor: { userId: principal.userId, profileId: principal.profileId } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
