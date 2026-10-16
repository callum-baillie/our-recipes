import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { inventoryPdfExportSchema } from '@/lib/domain/pdf-export';
import { jsonError } from '@/lib/http';
import { pdfExportResponse } from '@/lib/pdf/export-response';
import { exportShoppingListPdf } from '@/lib/services/pdf-export-service';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  const list = z
    .string()
    .uuid()
    .safeParse((await context.params).listId);
  const parsed = inventoryPdfExportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !list.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pdf_export', 'Check the list and print options.'),
      access.requestId,
    );
  return pdfExportResponse(() => exportShoppingListPdf(list.data, parsed.data), access.requestId);
}
