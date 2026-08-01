import { authorizeApi } from '@/lib/api-auth';
import { ndjsonBulkResponse } from '@/lib/api-bulk';
import { bulkExportQuerySchema } from '@/lib/domain/auth';
import { jsonError } from '@/lib/http';
import { getCollection, listCollections } from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'collections', 'read');
  if (authorization.response) return authorization.response;
  const query = bulkExportQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) return jsonError(400, 'invalid_bulk_query', 'Check the export filters.');
  const updatedSince = query.data.updatedSince ? new Date(query.data.updatedSince) : null;
  const collections = listCollections()
    .filter((collection) => !updatedSince || collection.updatedAt > updatedSince)
    .flatMap((collection) => {
      const detail = getCollection(collection.id);
      return detail ? [detail] : [];
    });
  return ndjsonBulkResponse('collections', collections, authorization.requestId);
}
