import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { jsonError } from '@/lib/http';
import { listAiJobs } from '@/lib/services/ai-job-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const profileId = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const threadId = new URL(request.url).searchParams.get('threadId');
  return NextResponse.json({
    jobs: listAiJobs({ profileId, threadId: threadId || null }),
  });
}
