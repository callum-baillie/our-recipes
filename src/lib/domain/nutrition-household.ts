export type NutritionHouseholdLink = {
  nutritionProfileId: string;
  householdProfileId: string | null;
  ownerPrincipalId: string;
  archivedAt: Date | null;
};

export type NutritionHouseholdLinkAudit = {
  linkedByHouseholdProfileId: Map<string, NutritionHouseholdLink>;
  missingHouseholdProfileIds: string[];
};

export type NutritionMutationActor = {
  householdProfileId: string;
  compatibilityPrincipalId: string;
};

export type NutritionMutationActorInput = NutritionMutationActor | string;

export class NutritionHouseholdLinkConflictError extends Error {}

export function auditNutritionHouseholdLinks(
  householdProfiles: readonly (string | { id: string; archivedAt: Date | null })[],
  links: readonly NutritionHouseholdLink[],
): NutritionHouseholdLinkAudit {
  const householdById = new Map(
    householdProfiles.map((profile) =>
      typeof profile === 'string' ? [profile, null] : [profile.id, profile.archivedAt],
    ),
  );
  const linkedByHouseholdProfileId = new Map<string, NutritionHouseholdLink>();
  const owners = new Set<string>();

  for (const link of links) {
    if (link.householdProfileId === null) {
      throw new NutritionHouseholdLinkConflictError(
        'A legacy Nutrition profile is not linked to a household profile.',
      );
    }
    if (!householdById.has(link.householdProfileId)) {
      throw new NutritionHouseholdLinkConflictError(
        'A Nutrition profile links to a missing or archived household profile.',
      );
    }
    if ((link.archivedAt === null) !== (householdById.get(link.householdProfileId) === null)) {
      throw new NutritionHouseholdLinkConflictError(
        'A linked household and Nutrition profile have different archive states.',
      );
    }
    if (linkedByHouseholdProfileId.has(link.householdProfileId)) {
      throw new NutritionHouseholdLinkConflictError(
        'More than one Nutrition profile links to the same household profile.',
      );
    }
    if (owners.has(link.ownerPrincipalId)) {
      throw new NutritionHouseholdLinkConflictError(
        'A compatibility principal owns more than one linked Nutrition profile.',
      );
    }
    owners.add(link.ownerPrincipalId);
    linkedByHouseholdProfileId.set(link.householdProfileId, link);
  }

  return {
    linkedByHouseholdProfileId,
    missingHouseholdProfileIds: [...householdById.keys()].filter(
      (profileId) => !linkedByHouseholdProfileId.has(profileId),
    ),
  };
}
