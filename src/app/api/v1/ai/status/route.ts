import { NextResponse } from 'next/server';

import { getAiReadiness } from '@/lib/services/ai-readiness-service';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: getAiReadiness() },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}
