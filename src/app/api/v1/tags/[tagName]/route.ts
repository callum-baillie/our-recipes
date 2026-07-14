import { NextResponse } from 'next/server';

import { tagNameSchema, updateTagSchema } from '@/lib/domain/tag';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const name = await sourceName(context);
  if (!name) return jsonError(400, 'invalid_tag', 'Check the tag name.');
  const parsed = updateTagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_tag', 'Check the tag name and color.');
  try {
    return NextResponse.json({ tag: updateTag(name, parsed.data) });
  } catch (error) {
    if (error instanceof TagNotFoundError) return jsonError(404, 'tag_not_found', error.message);
    if (error instanceof TagConflictError) return jsonError(409, 'tag_conflict', error.message);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ tagName: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const name = await sourceName(context);
  if (!name) return jsonError(400, 'invalid_tag', 'Check the tag name.');
  try {
    deleteTag(name);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TagNotFoundError) return jsonError(404, 'tag_not_found', error.message);
    throw error;
  }
}
