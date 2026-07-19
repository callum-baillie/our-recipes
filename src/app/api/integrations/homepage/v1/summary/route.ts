import { NextResponse } from 'next/server';

import { hasValidHomepageIntegrationToken } from '@/lib/providers/homepage-integration-token';
import { buildHomepageSummary } from '@/lib/services/homepage-integration-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
};

export function GET(request: Request) {
  if (!hasValidHomepageIntegrationToken(request)) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_integration_credentials',
          message: 'Valid Homepage integration credentials are required.',
        },
      },
      {
        status: 401,
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
          'WWW-Authenticate': 'Bearer realm="Homepage integration"',
        },
      },
    );
  }

  return NextResponse.json(buildHomepageSummary(), { headers: PRIVATE_RESPONSE_HEADERS });
}
