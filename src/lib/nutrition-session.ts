import 'server-only';

import { getRuntimeConfig } from '@/lib/config';
import {
  NUTRITION_ACCESS_COOKIE,
  createNutritionSessionValue,
  parseNutritionSessionValue,
} from '@/lib/nutrition-access';
import { resolveNutritionPrincipal } from '@/lib/services/nutrition-profile-service';

const SESSION_SECONDS = 60 * 60 * 24 * 30;

export function issueNutritionSessionValue(
  principal: { id: string; accessVersion: number },
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  return createNutritionSessionValue(
    {
      principalId: principal.id,
      accessVersion: principal.accessVersion,
      issuedAt,
      expiresAt: issuedAt + SESSION_SECONDS,
    },
    getRuntimeConfig().cookieSecret,
  );
}

export function resolveNutritionSession(value: string | undefined, now = new Date()) {
  const claims = parseNutritionSessionValue(value, getRuntimeConfig().cookieSecret, {
    nowSeconds: Math.floor(now.getTime() / 1_000),
  });
  return claims ? resolveNutritionPrincipal(claims.principalId, claims.accessVersion) : null;
}

export function nutritionSessionCookie() {
  const config = getRuntimeConfig();
  return {
    name: NUTRITION_ACCESS_COOKIE,
    options: {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: config.isProduction,
      path: '/',
      maxAge: SESSION_SECONDS,
    },
  };
}
