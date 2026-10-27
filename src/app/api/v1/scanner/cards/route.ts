import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { exportScannerCards } from '@/lib/services/scanner-cards-service';
import { ScannerError } from '@/lib/domain/scanner';
import { jsonError } from '@/lib/http';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  const reply = (r: Response) => withApiRequestId(r, access.requestId);
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    if (
      query.kind === 'recipe' &&
      access.principal.kind === 'api-key' &&
      !access.principal.apiPermissions?.recipes?.includes('read')
    )
      return reply(jsonError(403, 'scanner_scope_required', 'Recipe read permission required.'));
    const file = await exportScannerCards(query);
    return reply(
      new Response(new Uint8Array(file.bytes), {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.filename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
    );
  } catch (e) {
    if (e instanceof ScannerError) return reply(jsonError(e.status, e.code, e.message));
    if (e instanceof ZodError)
      return reply(
        jsonError(400, 'scanner_invalid_card', 'Choose a supported card and valid identifier.'),
      );
    throw e;
  }
}
