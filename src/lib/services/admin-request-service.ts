import 'server-only';
import { requireAdminSession, RequestAuthError } from './auth-service';
import { jsonError } from '@/lib/http';
/** Repeat administrative authorization at the handler boundary, including direct invocations. */
export async function adminRequestError(request: Request) {
  try {
    await requireAdminSession(request, { fresh: false });
    return null;
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonError(error.status, error.code, error.message);
    throw error;
  }
}
