import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  getHomepageIntegrationSummary,
  hasHomepageIntegrationToken,
  hasValidHomepageIntegrationAuthorization,
} from '@/lib/services/homepage-integration-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!hasHomepageIntegrationToken())
    return jsonError(
      503,
      'homepage_integration_unavailable',
      'This integration is not configured.',
    );
  if (!hasValidHomepageIntegrationAuthorization(request.headers.get('authorization')))
    return jsonError(
      401,
      'homepage_integration_unauthorized',
      'A valid integration token is required.',
    );
  return NextResponse.json(getHomepageIntegrationSummary(), {
    headers: {
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
