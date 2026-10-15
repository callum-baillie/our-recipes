import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { jsonError } from '@/lib/http';
import { instacartRequestSchema, instacartMeasurement } from '@/lib/domain/instacart';
import { getShoppingList } from '@/lib/services/planning-service';
import { createInstacartLink, InstacartError } from '@/lib/services/instacart-service';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const auth = await authorizeApi(request, 'shoppingLists', 'update');
  if (auth.response) return auth.response;
  const originError = requireTrustedSessionMutation(request, auth.principal, auth.requestId);
  if (originError) return originError;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).listId);
  const parsed = instacartRequestSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success)
    return jsonError(
      400,
      'invalid_instacart_list',
      parsed.success ? 'Invalid list ID.' : (parsed.error.issues[0]?.message ?? 'Check the items.'),
    );
  const list = getShoppingList(id.data);
  if (!list) return jsonError(404, 'list_not_found', 'This shopping list no longer exists.');
  const current = new Map(list.items.map((item) => [item.id, item]));
  if (parsed.data.items.some((item) => !current.has(item.id)))
    return jsonError(409, 'list_changed', 'The list changed. Close this dialog and try again.');
  const line_items = parsed.data.items.map((item) => {
    const source = current.get(item.id)!;
    const amount = [source.quantity, source.unit]
      .filter((value) => value !== null && value !== '')
      .join(' ');
    return {
      name: item.name,
      display_text: [amount, item.name].filter(Boolean).join(' '),
      line_item_measurements: instacartMeasurement(source.quantity, source.unit),
      ...(item.upc ? { upcs: [item.upc] } : {}),
    };
  });
  try {
    const url = await createInstacartLink(list.id, {
      title: list.name,
      link_type: 'shopping_list',
      expires_in: 7,
      line_items,
    });
    return withApiRequestId(
      NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } }),
      auth.requestId,
    );
  } catch (error) {
    if (error instanceof InstacartError)
      return jsonError(error.status, 'instacart_unavailable', error.message);
    throw error;
  }
}
