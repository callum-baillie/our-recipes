import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Authenticates the private Homepage server-to-server integration without ever
 * returning or logging its configured bearer token. Hashing first gives
 * timingSafeEqual fixed-length inputs even when the supplied token is malformed.
 */
export function hasValidHomepageIntegrationToken(request: Request): boolean {
  const expectedToken = process.env.HOMEPAGE_INTEGRATION_TOKEN;
  if (!expectedToken) return false;

  const authorization = request.headers.get('authorization');
  const match = /^Bearer[\t ]+([^\s]+)[\t ]*$/iu.exec(authorization ?? '');
  if (!match) return false;

  return timingSafeEqual(digest(match[1]!), digest(expectedToken));
}
