import { createHmac, timingSafeEqual } from 'node:crypto';
import { count } from 'drizzle-orm';

import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { user } from '@/lib/db/schema';
import { getProfile, listProfiles } from '@/lib/services/household-service';

export const ACTIVE_PROFILE_COOKIE = 'bord_active_profile';
export const LEGACY_ACTIVE_PROFILE_COOKIE = 'our_recipes_active_profile';

export type ActorContext = {
  profileId: string | null;
  source:
    'auth-session' | 'profile-pin' | 'api-key' | 'profile-cookie' | 'profile-default' | 'anonymous';
};

function sign(payload: string): string {
  return createHmac('sha256', getRuntimeConfig().cookieSecret).update(payload).digest('base64url');
}

export function createSignedProfileValue(profileId: string, sessionId?: string): string {
  if (!sessionId) return `${profileId}.${sign(profileId)}`;
  const payload = Buffer.from(JSON.stringify({ profileId, sessionId }), 'utf8').toString(
    'base64url',
  );
  return `v2.${payload}.${sign(`v2.${payload}`)}`;
}

export function parseSignedProfileValue(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('v2.')) {
    const parts = value.split('.');
    if (parts.length !== 3) return null;
    const [, payload, signature] = parts;
    if (!payload || !signature) return null;
    const expected = sign(`v2.${payload}`);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        profileId?: unknown;
      };
      return typeof decoded.profileId === 'string' ? decoded.profileId : null;
    } catch {
      return null;
    }
  }
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const profileId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(profileId);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? profileId : null;
}

export function parseSessionBoundProfileValue(
  value: string | undefined,
  sessionId: string,
): string | null {
  if (!value?.startsWith('v2.')) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const profileId = parseSignedProfileValue(value);
  if (!profileId) return null;
  try {
    const decoded = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      sessionId?: unknown;
    };
    return decoded.sessionId === sessionId ? profileId : null;
  } catch {
    return null;
  }
}

function hasAuthenticationUsers(): boolean {
  ensureDatabase();
  return (getDatabase().select({ count: count() }).from(user).get()?.count ?? 0) > 0;
}

export function getActorContext(cookieValue: string | undefined): ActorContext {
  const profileId = parseSignedProfileValue(cookieValue);
  if (profileId && getProfile(profileId)) {
    return {
      profileId,
      source: cookieValue?.startsWith('v2.') ? 'auth-session' : 'profile-cookie',
    };
  }

  if (hasAuthenticationUsers()) return { profileId: null, source: 'anonymous' };

  // Household profiles personalize audit/history records; they are not an
  // authentication boundary. Match the profile visibly selected by the
  // header when a browser has no valid cookie (for example, after changing
  // hostnames between localhost and a LAN address).
  const defaultProfile = listProfiles()[0];
  return defaultProfile
    ? { profileId: defaultProfile.id, source: 'profile-default' }
    : { profileId: null, source: 'anonymous' };
}
