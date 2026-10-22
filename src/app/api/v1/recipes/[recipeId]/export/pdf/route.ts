import { resolveRecipeForExport } from '@/lib/services/effective-recipe-export-service';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { recipePdfExportSchema } from '@/lib/domain/pdf-export';
import { jsonError } from '@/lib/http';
import { pdfExportResponse } from '@/lib/pdf/export-response';
import { exportRecipesPdf, exportEffectiveRecipePdf } from '@/lib/services/pdf-export-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  const { recipeId } = await context.params;
  const params = new URL(request.url).searchParams;
  const parsed = recipePdfExportSchema.safeParse({
    recipeIds: [recipeId],
    paper: params.get('paper') ?? 'A4',
    ...(params.has('servings') ? { servings: Number(params.get('servings')) } : {}),
  });
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pdf_export', 'Choose a valid recipe, paper size, and serving count.'),
      access.requestId,
    );
  if (params.has('sessionId') || params.has('mealEntryId')) {
    try {
      const recipe = resolveRecipeForExport(access.principal, recipeId, params);
      if (!recipe)
        return withApiRequestId(
          jsonError(404, 'recipe_not_found', 'That recipe no longer exists.'),
          access.requestId,
        );
      return pdfExportResponse(
        () => exportEffectiveRecipePdf(recipe, parsed.data),
        access.requestId,
      );
    } catch (error) {
      return withApiRequestId(decisionErrorResponse(error), access.requestId);
    }
  }
  return pdfExportResponse(() => exportRecipesPdf(parsed.data), access.requestId);
}
