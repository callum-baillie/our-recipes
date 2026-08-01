import { authorizeApi } from '@/lib/api-auth';
import { ndjsonBulkResponse } from '@/lib/api-bulk';
import { bulkExportQuerySchema } from '@/lib/domain/auth';
import { jsonError } from '@/lib/http';
import { listPlannedMeals } from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'mealPlans', 'read');
  if (authorization.response) return authorization.response;
  const query = bulkExportQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) return jsonError(400, 'invalid_bulk_query', 'Check the export filters.');
  const updatedSince = query.data.updatedSince ? new Date(query.data.updatedSince) : null;
  const meals = listPlannedMeals('0001-01-01', '9999-12-31').filter(
    (meal) => !updatedSince || meal.updatedAt > updatedSince,
  );
  return ndjsonBulkResponse('mealPlans', meals, authorization.requestId);
}
