import { authorizeApi } from '@/lib/api-auth';
import { ndjsonBulkResponse } from '@/lib/api-bulk';
import { bulkExportQuerySchema } from '@/lib/domain/auth';
import { jsonError } from '@/lib/http';
import { getRecipe, listRecipeLibrary } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'recipes', 'read');
  if (authorization.response) return authorization.response;
  const query = bulkExportQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) return jsonError(400, 'invalid_bulk_query', 'Check the export filters.');
  const updatedSince = query.data.updatedSince ? new Date(query.data.updatedSince) : null;
  const summaries = listRecipeLibrary(
    {
      q: '',
      status: query.data.includeInactive ? 'all' : 'active',
      sort: 'recently-updated',
      page: 1,
    },
    authorization.principal.profileId,
    50_000,
  ).recipes.filter((recipe) => !updatedSince || recipe.updatedAt > updatedSince);
  const recipes = summaries.flatMap((summary) => {
    const recipe = getRecipe(summary.id, authorization.principal.profileId);
    return recipe ? [recipe] : [];
  });
  return ndjsonBulkResponse('recipes', recipes, authorization.requestId);
}
