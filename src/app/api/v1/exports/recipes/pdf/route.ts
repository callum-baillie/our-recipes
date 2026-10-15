import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { recipePdfExportSchema } from '@/lib/domain/pdf-export';
import { jsonError } from '@/lib/http';
import { pdfExportResponse } from '@/lib/pdf/export-response';
import { exportRecipesPdf } from '@/lib/services/pdf-export-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  const parsed = recipePdfExportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(
        400,
        'invalid_pdf_export',
        parsed.error.issues[0]?.message ?? 'Select 1 to 100 recipes.',
      ),
      access.requestId,
    );
  return pdfExportResponse(() => exportRecipesPdf(parsed.data), access.requestId);
}
