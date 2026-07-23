import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createAiChatThread, listAiChatThreads } from '@/lib/services/ai-chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const createSchema = z.object({ title: z.string().trim().min(1).max(80).optional() }).strict();

async function profileId() {
  return getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
}

export async function GET() {
  const actor = await profileId();
  if (!actor)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  return NextResponse.json({ threads: listAiChatThreads(actor) });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = await profileId();
  if (!actor)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, 'invalid_thread', 'Check the conversation title.');
  return NextResponse.json(
    { thread: createAiChatThread(actor, parsed.data.title) },
    { status: 201 },
  );
}
