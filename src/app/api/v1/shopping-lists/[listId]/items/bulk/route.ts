import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { jsonError } from '@/lib/http';
import { addShoppingNames } from '@/lib/services/shopping-shortcuts-service';
import { PlanningNotFoundError } from '@/lib/services/planning-service';
export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).listId);
  const parsed = z
    .object({ items: z.array(z.string().trim().min(1).max(160)).min(1).max(100) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success || !id.success)
    return withApiRequestId(
      jsonError(400, 'invalid_bulk_items', 'Enter 1 to 100 items, each up to 160 characters.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(addShoppingNames(id.data, parsed.data.items, access.principal.profileId), {
        status: 201,
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'list_not_found', error.message);
    throw error;
  }
}
