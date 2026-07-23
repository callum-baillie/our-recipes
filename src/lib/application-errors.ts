import 'server-only';

import { createHash } from 'node:crypto';

type RedactedApplicationError = {
  occurredAt: string;
  fingerprint: string;
  errorType: string;
  route: string;
};

const recentErrors: RedactedApplicationError[] = [];

function safeRoute(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, ':id')
    .replace(/\?.*$/u, '')
    .slice(0, 200);
}

export function recordApplicationError(error: unknown, route = 'unknown'): void {
  const errorType = error instanceof Error ? error.name : 'UnknownError';
  const fingerprint = createHash('sha256')
    .update(`${errorType}:${error instanceof Error ? error.message : String(error)}`)
    .digest('hex')
    .slice(0, 16);
  recentErrors.unshift({
    occurredAt: new Date().toISOString(),
    fingerprint,
    errorType,
    route: safeRoute(route),
  });
  recentErrors.length = Math.min(recentErrors.length, 25);
}

export function listRedactedApplicationErrors(): RedactedApplicationError[] {
  return recentErrors.map((error) => ({ ...error }));
}
