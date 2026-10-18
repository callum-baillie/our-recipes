import { NextResponse } from 'next/server';
import { getAiReadiness } from '@/lib/services/ai-readiness-service';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { canAccountUseAi } from '@/lib/services/ai-access-service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  const status = getAiReadiness();
  const enabled = !!principal && canAccountUseAi(principal.userId);
  return NextResponse.json(
    {
      status: enabled
        ? status
        : {
            ...status,
            enabled: false,
            message: 'AI is disabled for this account. Ask an administrator to review access.',
          },
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}
