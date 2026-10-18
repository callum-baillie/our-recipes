import 'server-only';
import { createHash } from 'node:crypto';
import { getDatabase } from '@/lib/db/client';
import { getProfile, updateProfile } from './household-service';
import { kitchenContextUpdateSchema } from '@/lib/domain/profile-goals';
import { DecisionError } from '@/lib/providers/decisions-provider';
export function readKitchenContext(profileId: string) {
  const profile = getProfile(profileId);
  if (!profile) throw new DecisionError('Profile not found.', 404);
  const interview = profile.goalContext.kitchenInterview ?? null;
  return {
    interview,
    revision: createHash('sha256').update(JSON.stringify(interview)).digest('hex'),
  };
}
export function updateKitchenContext(profileId: string, raw: unknown) {
  const input = kitchenContextUpdateSchema.parse(raw);
  return getDatabase().transaction(() => {
    const current = readKitchenContext(profileId);
    if (current.revision !== input.expectedRevision)
      throw new DecisionError('Your kitchen context changed. Read it again before saving.', 409);
    const profile = getProfile(profileId)!;
    updateProfile(profileId, {
      displayName: profile.displayName,
      color: profile.color,
      units: profile.units,
      temperatureUnit: profile.temperatureUnit,
      locale: profile.locale,
      timezone: profile.timezone,
      goalContext: { ...profile.goalContext, kitchenInterview: input.interview },
    });
    return readKitchenContext(profileId);
  });
}
