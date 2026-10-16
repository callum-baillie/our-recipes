import { NextResponse } from 'next/server';

import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { jsonError } from '@/lib/http';
import { listAiJobs } from '@/lib/services/ai-job-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal) return jsonError(401, 'sign_in_required', 'Sign in to view background tasks.');
  const profileId =
    new URL(request.url).searchParams.get('personal') === 'true'
      ? principal.linkedProfileId
      : principal.profileId;
  const threadId = new URL(request.url).searchParams.get('threadId');
  return NextResponse.json({
    jobs: listAiJobs({ profileId, threadId: threadId || null }),
  });
}
