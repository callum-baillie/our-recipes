import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { tagNameSchema, updateTagSchema } from '@/lib/domain/tag';
import { jsonError } from '@/lib/http';
import {
  deleteTag,
  TagConflictError,
  TagNotFoundError,
  updateTag,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function sourceName(context: {
  params: Promise<{ tagName: string }>;
}): Promise<string | null> {
  return tagNameSchema.safeParse(decodeURIComponent((await context.params).tagName)).data ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ tagName: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const name = await sourceName(context);
  if (!name)
    return withApiRequestId(jsonError(400, 'invalid_tag', 'Check the tag name.'), access.requestId);
  const parsed = updateTagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_tag', 'Check the tag name and color.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({ tag: updateTag(name, parsed.data) }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof TagNotFoundError)
      return withApiRequestId(jsonError(404, 'tag_not_found', error.message), access.requestId);
    if (error instanceof TagConflictError)
      return withApiRequestId(jsonError(409, 'tag_conflict', error.message), access.requestId);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ tagName: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const name = await sourceName(context);
  if (!name)
    return withApiRequestId(jsonError(400, 'invalid_tag', 'Check the tag name.'), access.requestId);
  try {
    deleteTag(name);
    return withApiRequestId(new NextResponse(null, { status: 204 }), access.requestId);
  } catch (error) {
    if (error instanceof TagNotFoundError)
      return withApiRequestId(jsonError(404, 'tag_not_found', error.message), access.requestId);
    throw error;
  }
}
