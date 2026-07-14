import { NextResponse } from 'next/server';

import { getRuntimeConfig } from '@/lib/config';

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function hasTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const config = getRuntimeConfig();
  const requestUrl = new URL(request.url);
  const sameOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  const trustedOrigins = new Set([
    sameOrigin,
    ...(config.appOrigin ? [config.appOrigin] : []),
    ...config.trustedOrigins,
  ]);
  return trustedOrigins.has(origin);
}
