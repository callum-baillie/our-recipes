import { createHmac, timingSafeEqual } from 'node:crypto';

import { getRuntimeConfig } from '@/lib/config';
import { getProfile, listProfiles } from '@/lib/services/household-service';

export const ACTIVE_PROFILE_COOKIE = 'our_recipes_active_profile';

export type ActorContext = {
  profileId: string | null;
  source: 'profile-cookie' | 'profile-default' | 'anonymous';
};

function sign(profileId: string): string {
  return createHmac('sha256', getRuntimeConfig().cookieSecret)
    .update(profileId)
    .digest('base64url');
}

export function createSignedProfileValue(profileId: string): string {
  return `${profileId}.${sign(profileId)}`;
}

export function parseSignedProfileValue(value: string | undefined): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const profileId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(profileId);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? profileId : null;
}

export function getActorContext(cookieValue: string | undefined): ActorContext {
  const profileId = parseSignedProfileValue(cookieValue);
  if (profileId && getProfile(profileId)) return { profileId, source: 'profile-cookie' };

  // Household profiles personalize audit/history records; they are not an
  // authentication boundary. Match the profile visibly selected by the
  // header when a browser has no valid cookie (for example, after changing
  // hostnames between localhost and a LAN address).
  const defaultProfile = listProfiles()[0];
  return defaultProfile
    ? { profileId: defaultProfile.id, source: 'profile-default' }
    : { profileId: null, source: 'anonymous' };
}
