import 'server-only';
import { createHash } from 'node:crypto';
import { getDatabase } from '@/lib/db/client';
import { getProfile, updateProfile } from './household-service';
import {
  kitchenContextUpdateSchema,
  kitchenContextPatchSchema,
  kitchenInterviewSchema,
} from '@/lib/domain/profile-goals';
import { DecisionError } from '@/lib/providers/decisions-provider';
export function readKitchenContext(profileId: string) {
  const profile = getProfile(profileId);
  if (!profile) throw new DecisionError('Profile not found.', 404);
  const interview = profile.goalContext.kitchenInterview ?? null;
  return {
    subject: { displayName: profile.displayName },
    interview,
    revision: createHash('sha256').update(JSON.stringify(interview)).digest('hex'),
  };
}
export function updateKitchenContext(profileId: string, raw: unknown) {
  const input = kitchenContextPatchSchema.or(kitchenContextUpdateSchema).parse(raw);
  return getDatabase().transaction(() => {
    const current = readKitchenContext(profileId);
    if (current.revision !== input.expectedRevision)
      throw new DecisionError('Your kitchen context changed. Read it again before saving.', 409);
    const profile = getProfile(profileId)!;
    const interview =
      'interviewPatch' in input
        ? {
            ...kitchenInterviewSchema.parse({
              taste: '',
              snacks: '',
              desserts: '',
              routine: '',
              favorites: '',
              avoid: '',
              ...current.interview,
            }),
            ...input.interviewPatch,
            ...Object.fromEntries(input.clearFields.map((key) => [key, ''])),
          }
        : input.interview;
    updateProfile(profileId, {
      displayName: profile.displayName,
      color: profile.color,
      units: profile.units,
      temperatureUnit: profile.temperatureUnit,
      locale: profile.locale,
      timezone: profile.timezone,
      goalContext: { ...profile.goalContext, kitchenInterview: interview },
    });
    return readKitchenContext(profileId);
  });
}
