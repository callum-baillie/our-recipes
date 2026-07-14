import { NextResponse } from 'next/server';

import { createTagSchema } from '@/lib/domain/tag';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createTag, listTags, TagConflictError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ tags: listTags() });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const parsed = createTagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_tag', 'Check the tag name and color.');
  try {
    return NextResponse.json({ tag: createTag(parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof TagConflictError) return jsonError(409, 'tag_conflict', error.message);
    throw error;
  }
}
