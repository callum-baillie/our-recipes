import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { inventoryPdfExportSchema } from '@/lib/domain/pdf-export';
import { jsonError } from '@/lib/http';
import { pdfExportResponse } from '@/lib/pdf/export-response';
import { exportPantryPdf } from '@/lib/services/pdf-export-service';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  const parsed = inventoryPdfExportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(
        400,
        'invalid_pdf_export',
        parsed.error.issues[0]?.message ?? 'Check print options.',
      ),
      access.requestId,
    );
  return pdfExportResponse(() => exportPantryPdf(parsed.data), access.requestId);
}
