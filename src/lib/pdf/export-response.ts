import { withApiRequestId } from '@/lib/api-auth';
import { jsonError } from '@/lib/http';
import { PdfExportError, type KitchenExport } from '@/lib/services/pdf-export-service';

export async function pdfExportResponse(work: () => Promise<KitchenExport>, requestId: string) {
  try {
    const result = await work();
    return withApiRequestId(
      new Response(new Uint8Array(result.bytes), {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
      requestId,
    );
  } catch (error) {
    if (!(error instanceof PdfExportError)) throw error;
    const response = withApiRequestId(
      jsonError(error.status, 'pdf_export_unavailable', error.message),
      requestId,
    );
    if (error.status === 429) response.headers.set('Retry-After', '10');
    return response;
  }
}
