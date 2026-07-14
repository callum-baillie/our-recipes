import { NextResponse } from 'next/server';

import { mergeTagSchema, tagNameSchema } from '@/lib/domain/tag';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { mergeTag, TagNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ tagName: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const source = tagNameSchema.safeParse(decodeURIComponent((await context.params).tagName));
  const parsed = mergeTagSchema.safeParse(await request.json().catch(() => null));
  if (!source.success || !parsed.success)
    return jsonError(400, 'invalid_tag', 'Check the tag merge details.');
  try {
    return NextResponse.json({
      tag: mergeTag(source.data, { name: parsed.data.targetName, color: parsed.data.targetColor }),
    });
  } catch (error) {
    if (error instanceof TagNotFoundError) return jsonError(404, 'tag_not_found', error.message);
    throw error;
  }
}
