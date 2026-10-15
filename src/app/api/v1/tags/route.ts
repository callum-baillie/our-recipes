import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { createTagSchema } from '@/lib/domain/tag';
import { jsonError } from '@/lib/http';
import { createTag, listTags, TagConflictError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  return withApiRequestId(NextResponse.json({ tags: listTags() }), access.requestId);
}

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = createTagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_tag', 'Check the tag name and color.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({ tag: createTag(parsed.data) }, { status: 201 }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof TagConflictError)
      return withApiRequestId(jsonError(409, 'tag_conflict', error.message), access.requestId);
    throw error;
  }
}
