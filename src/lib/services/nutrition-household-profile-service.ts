import 'server-only';

import type { ActorContext } from '@/lib/actor-context';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { nutritionProfiles } from '@/lib/db/schema';
import {
  auditNutritionHouseholdLinks,
  NutritionHouseholdLinkConflictError,
} from '@/lib/domain/nutrition-household';
import { listProfiles } from '@/lib/services/household-service';

export { NutritionHouseholdLinkConflictError };

export type NutritionHouseholdContext = {
  actor: ActorContext & { profileId: string };
  activeNutritionProfile: typeof nutritionProfiles.$inferSelect;
  compatibilityPrincipalId: string;
  householdNutritionProfiles: Array<typeof nutritionProfiles.$inferSelect>;
};

export class NutritionHouseholdActorRequiredError extends Error {}

export function resolveNutritionHouseholdContext(actor: ActorContext): NutritionHouseholdContext {
  if (!actor.profileId) {
    throw new NutritionHouseholdActorRequiredError('Select a household profile to use Nutrition.');
  }
  ensureDatabase();
  const database = getDatabase();
  const householdProfiles = listProfiles(true);
  if (!householdProfiles.some((profile) => profile.id === actor.profileId && !profile.archivedAt)) {
    throw new NutritionHouseholdActorRequiredError(
      'The active household profile is no longer available.',
    );
  }

  const current = database.select().from(nutritionProfiles).all();
  const audit = auditNutritionHouseholdLinks(
    householdProfiles,
    current.map((profile) => ({
      nutritionProfileId: profile.id,
      householdProfileId: profile.linkedHouseholdProfileId,
      ownerPrincipalId: profile.ownerPrincipalId,
      archivedAt: profile.archivedAt,
    })),
  );

  if (audit.missingHouseholdProfileIds.length > 0) {
    throw new NutritionHouseholdLinkConflictError(
      'A household profile is missing its provisioned Nutrition profile.',
    );
  }

  const householdNutritionProfiles = householdProfiles.map((householdProfile) => {
    const profile = audit.linkedByHouseholdProfileId.get(householdProfile.id);
    if (!profile) {
      throw new NutritionHouseholdLinkConflictError(
        'A household profile could not be converged with Nutrition.',
      );
    }
    return current.find((candidate) => candidate.id === profile.nutritionProfileId)!;
  });
  const activeNutritionProfile = householdNutritionProfiles.find(
    (profile) => profile.linkedHouseholdProfileId === actor.profileId,
  )!;
  return {
    actor: actor as ActorContext & { profileId: string },
    activeNutritionProfile,
    compatibilityPrincipalId: activeNutritionProfile.ownerPrincipalId,
    householdNutritionProfiles,
  };
}
