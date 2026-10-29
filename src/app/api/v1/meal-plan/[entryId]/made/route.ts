import { z } from 'zod';
import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { prepareIdempotentMutation, executeIdempotentMutation } from '@/lib/api-idempotency';
import { mealCompletionSchema } from '@/lib/domain/meal-completion';
import { ScannerError } from '@/lib/domain/scanner';
import { jsonError } from '@/lib/http';
import { completePlannedRecipe } from '@/lib/services/meal-completion-service';
import { nutritionApiError } from '@/app/api/v1/nutrition/_shared';
export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const access = await authorizeApi(request, 'mealPlans', 'update');
  if (access.response) return access.response;
  if (access.principal.kind !== 'session')
    return jsonError(403, 'session_required', 'Sign in to confirm meal portions.');
  const origin = requireTrustedSessionMutation(request, access.principal, access.requestId);
  if (origin) return origin;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).entryId);
  if (!id.success) return jsonError(400, 'invalid_meal_id', 'Choose a planned meal.');
  const intent = await prepareIdempotentMutation(request, access.principal, access.requestId);
  if (intent.response) return intent.response;
  const parsed = mealCompletionSchema.safeParse(intent.context.body);
  if (!parsed.success || parsed.data.mealPlanEntryId !== id.data)
    return jsonError(
      400,
      'invalid_meal_completion',
      'Check the recipe, planned meal and portions.',
    );
  try {
    return executeIdempotentMutation(
      intent.context,
      () =>
        completePlannedRecipe(
          parsed.data,
          { profileId: access.principal.linkedProfileId, source: 'auth-session' },
          access.principal.userId,
        ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof ScannerError)
      return withApiRequestId(jsonError(error.status, error.code, error.message), access.requestId);
    return withApiRequestId(nutritionApiError(error), access.requestId);
  }
}
