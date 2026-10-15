import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { mergeTagSchema, tagNameSchema } from '@/lib/domain/tag';
import { jsonError } from '@/lib/http';
import { mergeTag, TagNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ tagName: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const source = tagNameSchema.safeParse(decodeURIComponent((await context.params).tagName));
  const parsed = mergeTagSchema.safeParse(await request.json().catch(() => null));
  if (!source.success || !parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_tag', 'Check the tag merge details.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        tag: mergeTag(source.data, {
          name: parsed.data.targetName,
          color: parsed.data.targetColor,
        }),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof TagNotFoundError)
      return withApiRequestId(jsonError(404, 'tag_not_found', error.message), access.requestId);
    throw error;
  }
}
