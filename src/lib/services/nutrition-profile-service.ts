import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  nutritionBodyMeasurements,
  nutritionGoalVersions,
  nutritionPermissionVersions,
  nutritionPrincipals,
  nutritionProfiles,
} from '@/lib/db/schema';
import {
  authorizeNutritionProfileAccess,
  bodyMeasurementInputSchema,
  DEFAULT_NUTRITION_CARD_NUTRIENTS,
  DEFAULT_NUTRITION_VISIBLE_NUTRIENTS,
  nutritionCardNutrientCodesSchema,
  nutritionGoalVersionInputSchema,
  nutritionProfileInputSchema,
  nutritionProfileSettingsInputSchema,
  nutritionVisibleNutrientCodesSchema,
  type BodyMeasurementInput,
  type NutritionAccessAction,
  type NutritionGoalVersionInput,
  type NutritionPermissionGrant,
  type NutritionProfileInput,
  type NutritionProfileSettingsInput,
} from '@/lib/domain/nutrition-profile';
import type {
  NutritionMutationActor,
  NutritionMutationActorInput,
} from '@/lib/domain/nutrition-household';
import type { ProfileRecord as HouseholdProfileRecord } from '@/lib/services/household-service';

type Db = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
export const RETIRED_NUTRITION_CREDENTIAL = 'retired:actor-context-only:v1';
export class NutritionProfileNotFoundError extends Error {}
export class NutritionProfileForbiddenError extends Error {}
export class NutritionProfileConflictError extends Error {}
type ProfileRecord = typeof nutritionProfiles.$inferSelect;
type PrincipalPublic = Omit<typeof nutritionPrincipals.$inferSelect, 'credentialHash'>;

export type AccessibleNutritionProfile = Pick<
  ProfileRecord,
  | 'id'
  | 'displayName'
  | 'avatarUrl'
  | 'profileType'
  | 'measurementSystem'
  | 'preferredEnergyUnit'
  | 'dailyResetTimezone'
  | 'showPlannedNutrition'
  | 'showRecipeCardNutrition'
  | 'showMealPlanNutrition'
> & {
  visibleNutrientCodes: NutritionProfileInput['visibleNutrientCodes'];
  trendRangeDays: 7 | 14 | 30;
  recipeCardNutrientCodes: NutritionProfileInput['recipeCardNutrientCodes'];
  relationship: 'owner' | 'guardian' | 'viewer';
  canViewDiary: boolean;
  canViewMeasurements: boolean;
  canManageProfile: boolean;
  canManageGoals: boolean;
  canViewComparison: boolean;
  canExportData: boolean;
  canDeleteData: boolean;
  version: number;
};

function db() {
  ensureDatabase();
  return getDatabase();
}
function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new NutritionProfileNotFoundError(message);
  return value;
}
export function resolveNutritionMutationActor(
  actorInput: NutritionMutationActorInput,
  executor: Executor = db(),
): NutritionMutationActor {
  const principalId =
    typeof actorInput === 'string' ? actorInput : actorInput.compatibilityPrincipalId;
  const candidates = executor
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.ownerPrincipalId, principalId))
    .all()
    .filter((profile) => !profile.archivedAt);
  if (candidates.length !== 1) {
    throw new NutritionProfileForbiddenError('A unique active household actor is required.');
  }
  const candidate = candidates[0]!;
  if (
    typeof actorInput !== 'string' &&
    candidate.linkedHouseholdProfileId !== actorInput.householdProfileId
  ) {
    throw new NutritionProfileForbiddenError('Household actor attribution does not match.');
  }
  return {
    householdProfileId: candidate.linkedHouseholdProfileId,
    compatibilityPrincipalId: principalId,
  };
}
function publicPrincipal(record: typeof nutritionPrincipals.$inferSelect): PrincipalPublic {
  return {
    id: record.id,
    accessVersion: record.accessVersion,
    archivedAt: record.archivedAt,
    lastAuthenticatedAt: record.lastAuthenticatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
function latestGrants(executor: Executor, profileId: string): NutritionPermissionGrant[] {
  const rows = executor
    .select()
    .from(nutritionPermissionVersions)
    .where(eq(nutritionPermissionVersions.nutritionProfileId, profileId))
    .orderBy(desc(nutritionPermissionVersions.revision))
    .all();
  const seen = new Set<string>();
  const grants: NutritionPermissionGrant[] = [];
  for (const row of rows) {
    if (seen.has(row.principalId)) continue;
    seen.add(row.principalId);
    if (row.state === 'revoked') continue;
    grants.push({
      principalId: row.principalId,
      role: row.role,
      canViewDiary: row.canViewDiary,
      canViewMeasurements: row.canViewMeasurements,
      canManageProfile: row.canManageProfile,
      canManageGoals: row.canManageGoals,
      canViewComparison: row.canViewComparison,
      canExportData: row.canExportData,
      canDeleteData: row.canDeleteData,
      expiresAt: row.expiresAt,
    });
  }
  return grants;
}
function authorize(
  executor: Executor,
  profileId: string,
  requesterPrincipalId: string,
  action: NutritionAccessAction,
): ProfileRecord {
  const profile = required(
    executor.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, profileId)).get(),
    'Nutrition profile was not found.',
  );
  if (profile.archivedAt) {
    throw new NutritionProfileForbiddenError('Nutrition profile is archived.');
  }
  if (profile.linkedHouseholdProfileId !== null) {
    if (profile.ownerPrincipalId !== requesterPrincipalId) {
      throw new NutritionProfileForbiddenError(
        'This change belongs to the Nutrition profile linked to the active household profile.',
      );
    }
  } else {
    const decision = authorizeNutritionProfileAccess({
      requesterPrincipalId,
      profile: {
        ownerPrincipalId: profile.ownerPrincipalId,
        comparisonVisibility: profile.comparisonVisibility,
      },
      action,
      grants: latestGrants(executor, profileId),
    });
    if (!decision.allowed) {
      throw new NutritionProfileForbiddenError('Nutrition profile access was not granted.');
    }
  }
  return profile;
}

function authorizeSharedRead(
  executor: Executor,
  profileId: string,
  requesterPrincipalId: string,
  action: Extract<NutritionAccessAction, 'view_diary' | 'view_measurements' | 'view_comparison'>,
  loadedTarget?: ProfileRecord,
): ProfileRecord {
  const target =
    loadedTarget ??
    required(
      executor.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, profileId)).get(),
      'Nutrition profile was not found.',
    );
  if (target.archivedAt) {
    throw new NutritionProfileForbiddenError('Nutrition profile is archived.');
  }
  if (target.linkedHouseholdProfileId === null) {
    const decision = authorizeNutritionProfileAccess({
      requesterPrincipalId,
      profile: {
        ownerPrincipalId: target.ownerPrincipalId,
        comparisonVisibility: target.comparisonVisibility,
      },
      action,
      grants: latestGrants(executor, profileId),
    });
    if (!decision.allowed) {
      throw new NutritionProfileForbiddenError('Nutrition profile access was not granted.');
    }
    return target;
  }
  const requesterProfiles = executor
    .select()
    .from(nutritionProfiles)
    .where(
      and(
        eq(nutritionProfiles.ownerPrincipalId, requesterPrincipalId),
        isNull(nutritionProfiles.archivedAt),
      ),
    )
    .all()
    .filter((profile) => profile.linkedHouseholdProfileId !== null);
  if (requesterProfiles.length !== 1) {
    throw new NutritionProfileForbiddenError(
      'Shared Nutrition reads require one unambiguous linked household profile.',
    );
  }
  return target;
}

export function authorizeNutritionProfileRead(
  profileId: string,
  requesterPrincipalId: string,
  action: Extract<NutritionAccessAction, 'view_diary' | 'view_measurements' | 'view_comparison'>,
  executor: Executor = db(),
): ProfileRecord {
  return authorizeSharedRead(executor, profileId, requesterPrincipalId, action);
}

export function authorizeNutritionProfileAction(
  profileId: string,
  requesterPrincipalId: string,
  action: NutritionAccessAction,
  executor: Executor = db(),
): ProfileRecord {
  return authorize(executor, profileId, requesterPrincipalId, action);
}

export function authorizeNutritionHouseholdAllocationTarget(
  profileId: string,
  requesterPrincipalId: string,
  executor: Executor = db(),
): ProfileRecord {
  const requesterProfile = executor
    .select()
    .from(nutritionProfiles)
    .where(
      and(
        eq(nutritionProfiles.ownerPrincipalId, requesterPrincipalId),
        isNull(nutritionProfiles.archivedAt),
      ),
    )
    .get();
  const target = executor
    .select()
    .from(nutritionProfiles)
    .where(and(eq(nutritionProfiles.id, profileId), isNull(nutritionProfiles.archivedAt)))
    .get();
  if (
    !requesterProfile ||
    !target ||
    ((requesterProfile.linkedHouseholdProfileId === null ||
      target.linkedHouseholdProfileId === null) &&
      target.ownerPrincipalId !== requesterPrincipalId)
  ) {
    throw new NutritionProfileForbiddenError(
      'Allocations may target only explicitly linked household Nutrition profiles.',
    );
  }
  return target;
}

export function getNutritionDiaryAccessContext(profileId: string, requesterPrincipalId: string) {
  const database = db();
  const profile = required(
    database.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, profileId)).get(),
    'Nutrition profile was not found.',
  );
  if (profile.archivedAt) {
    throw new NutritionProfileForbiddenError('Nutrition profile is archived.');
  }
  if (profile.linkedHouseholdProfileId !== null) {
    authorizeSharedRead(database, profileId, requesterPrincipalId, 'view_diary', profile);
    return {
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        dailyResetTimezone: profile.dailyResetTimezone,
        showPlannedNutrition: profile.showPlannedNutrition,
      },
      canManageGoals: profile.ownerPrincipalId === requesterPrincipalId,
    };
  }
  const grants = latestGrants(database, profileId);
  const descriptor = {
    ownerPrincipalId: profile.ownerPrincipalId,
    comparisonVisibility: profile.comparisonVisibility,
  } as const;
  const diary = authorizeNutritionProfileAccess({
    requesterPrincipalId,
    profile: descriptor,
    action: 'view_diary',
    grants,
  });
  if (!diary.allowed) {
    throw new NutritionProfileForbiddenError('Nutrition profile access was not granted.');
  }
  const goals = authorizeNutritionProfileAccess({
    requesterPrincipalId,
    profile: descriptor,
    action: 'manage_goals',
    grants,
  });
  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      dailyResetTimezone: profile.dailyResetTimezone,
      showPlannedNutrition: profile.showPlannedNutrition,
    },
    canManageGoals: goals.allowed,
  };
}

export function getNutritionMeasurementAccessContext(
  profileId: string,
  requesterPrincipalId: string,
) {
  const database = db();
  const profile = required(
    database.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, profileId)).get(),
    'Nutrition profile was not found.',
  );
  if (profile.archivedAt) {
    throw new NutritionProfileForbiddenError('Nutrition profile is archived.');
  }
  if (profile.linkedHouseholdProfileId !== null) {
    authorizeSharedRead(database, profileId, requesterPrincipalId, 'view_measurements', profile);
    const canManageProfile = profile.ownerPrincipalId === requesterPrincipalId;
    return {
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        dailyResetTimezone: profile.dailyResetTimezone,
        measurementSystem: profile.measurementSystem,
        weightTrackingEnabled: profile.weightTrackingEnabled,
        targetWeightKilograms: canManageProfile ? profile.targetWeightKilograms : null,
      },
      canManageProfile,
    };
  }
  const grants = latestGrants(database, profileId);
  const descriptor = {
    ownerPrincipalId: profile.ownerPrincipalId,
    comparisonVisibility: profile.comparisonVisibility,
  } as const;
  const measurements = authorizeNutritionProfileAccess({
    requesterPrincipalId,
    profile: descriptor,
    action: 'view_measurements',
    grants,
  });
  if (!measurements.allowed) {
    throw new NutritionProfileForbiddenError('Nutrition profile access was not granted.');
  }
  const profileManagement = authorizeNutritionProfileAccess({
    requesterPrincipalId,
    profile: descriptor,
    action: 'manage_profile',
    grants,
  });
  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      dailyResetTimezone: profile.dailyResetTimezone,
      measurementSystem: profile.measurementSystem,
      weightTrackingEnabled: profile.weightTrackingEnabled,
      targetWeightKilograms: profileManagement.allowed ? profile.targetWeightKilograms : null,
    },
    canManageProfile: profileManagement.allowed,
  };
}
function profileValues(input: NutritionProfileInput, ownerPrincipalId: string, now: Date) {
  return {
    ownerPrincipalId,
    linkedHouseholdProfileId: input.linkedHouseholdProfileId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    profileType: input.profileType,
    ...profileSettingsValues(input, now),
    comparisonVisibility: input.comparisonVisibility,
    diaryVisibility: input.diaryVisibility,
  };
}

function profileSettingsValues(input: NutritionProfileSettingsInput, now: Date) {
  return {
    dateOfBirth: input.dateOfBirth,
    heightCentimeters: input.heightCentimeters,
    currentWeightKilograms: input.currentWeightKilograms,
    measurementSystem: input.measurementSystem,
    referenceSexCategory: input.referenceSexCategory,
    activityLevel: input.activityLevel,
    nutritionGoalType: input.nutritionGoalType,
    targetWeightKilograms: input.targetWeightKilograms,
    targetDate: input.targetDate,
    explicitlyEnteredLifeStage: input.explicitlyEnteredLifeStage,
    dietaryPreferences: JSON.stringify(input.dietaryPreferences),
    foodAllergies: JSON.stringify(input.foodAllergies),
    dietaryExclusions: JSON.stringify(input.dietaryExclusions),
    estimatedTargetsEnabled: input.estimatedTargetsEnabled,
    estimatedTargetConsent: input.estimatedTargetConsent,
    weightTrackingEnabled: input.weightTrackingEnabled,
    preferredEnergyUnit: input.preferredEnergyUnit,
    dailyResetTimezone: input.dailyResetTimezone,
    weekStartsOn: input.weekStartsOn,
    referenceJurisdiction: input.referenceJurisdiction,
    visibleNutrientCodes: JSON.stringify(input.visibleNutrientCodes),
    trendRangeDays: input.trendRangeDays,
    showPlannedNutrition: input.showPlannedNutrition,
    showRecipeCardNutrition: input.showRecipeCardNutrition,
    recipeCardNutrientCodes: JSON.stringify(input.recipeCardNutrientCodes),
    showMealPlanNutrition: input.showMealPlanNutrition,
    updatedAt: now,
  };
}

export function provisionLinkedNutritionProfile(
  householdProfile: HouseholdProfileRecord,
  executor: Executor = db(),
) {
  const existing = executor
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.linkedHouseholdProfileId, householdProfile.id))
    .get();
  if (existing) return existing;
  const input = nutritionProfileInputSchema.parse({
    displayName: householdProfile.displayName,
    avatarUrl: householdProfile.avatarUrl ?? '',
    linkedHouseholdProfileId: householdProfile.id,
    measurementSystem: householdProfile.units,
    dailyResetTimezone: householdProfile.timezone,
    comparisonVisibility: 'named',
  });
  const now = new Date();
  const create = (transaction: Executor) => {
    const principalId = householdProfile.id;
    if (
      transaction
        .select()
        .from(nutritionPrincipals)
        .where(eq(nutritionPrincipals.id, principalId))
        .get() ||
      transaction
        .select()
        .from(nutritionProfiles)
        .where(eq(nutritionProfiles.id, householdProfile.id))
        .get()
    ) {
      throw new NutritionProfileConflictError(
        'Deterministic household Nutrition identifiers already belong to another record.',
      );
    }
    transaction
      .insert(nutritionPrincipals)
      .values({
        id: principalId,
        credentialHash: RETIRED_NUTRITION_CREDENTIAL,
        accessVersion: 1,
        archivedAt: null,
        lastAuthenticatedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const profile = {
      id: householdProfile.id,
      ...profileValues(input, principalId, now),
      linkedHouseholdProfileId: householdProfile.id,
      version: 1,
      archivedAt: null,
      createdAt: now,
    } satisfies typeof nutritionProfiles.$inferInsert;
    transaction.insert(nutritionProfiles).values(profile).run();
    return transaction
      .select()
      .from(nutritionProfiles)
      .where(eq(nutritionProfiles.id, profile.id))
      .get()!;
  };
  return executor === db() ? db().transaction(create) : create(executor);
}

export function synchronizeLinkedNutritionProfileDisplay(
  householdProfile: HouseholdProfileRecord,
  executor: Executor = db(),
) {
  const current = executor
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.linkedHouseholdProfileId, householdProfile.id))
    .get();
  if (!current) return provisionLinkedNutritionProfile(householdProfile, executor);
  const avatarUrl = householdProfile.avatarUrl ?? '';
  if (
    current.displayName === householdProfile.displayName &&
    current.avatarUrl === avatarUrl &&
    current.archivedAt?.getTime() === householdProfile.archivedAt?.getTime()
  ) {
    return current;
  }
  const now = new Date();
  const result = executor
    .update(nutritionProfiles)
    .set({
      displayName: householdProfile.displayName,
      avatarUrl,
      archivedAt: householdProfile.archivedAt,
      version: current.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(nutritionProfiles.id, current.id),
        eq(nutritionProfiles.linkedHouseholdProfileId, householdProfile.id),
        eq(nutritionProfiles.version, current.version),
      ),
    )
    .run();
  const latest = required(
    executor.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, current.id)).get(),
    'Nutrition profile was not found.',
  );
  if (result.changes === 1) return latest;
  if (
    latest.displayName === householdProfile.displayName &&
    latest.avatarUrl === avatarUrl &&
    latest.archivedAt?.getTime() === householdProfile.archivedAt?.getTime()
  ) {
    return latest;
  }
  throw new NutritionProfileConflictError('Nutrition profile display changed concurrently.');
}

function visibleNutrientCodes(value: string): NutritionProfileInput['visibleNutrientCodes'] {
  try {
    const parsed = nutritionVisibleNutrientCodesSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [...DEFAULT_NUTRITION_VISIBLE_NUTRIENTS];
  } catch {
    return [...DEFAULT_NUTRITION_VISIBLE_NUTRIENTS];
  }
}

function recipeCardNutrientCodes(value: string): NutritionProfileInput['recipeCardNutrientCodes'] {
  try {
    const parsed = nutritionCardNutrientCodesSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [...DEFAULT_NUTRITION_CARD_NUTRIENTS];
  } catch {
    return [...DEFAULT_NUTRITION_CARD_NUTRIENTS];
  }
}

export function createNutritionIdentity(
  secret: string,
  rawProfile: unknown,
): { principal: PrincipalPublic; profile: ProfileRecord } {
  void secret;
  void rawProfile;
  throw new NutritionProfileForbiddenError(
    'Nutrition identities are provisioned from signed household profiles only.',
  );
}
export function createNutritionPrincipal(secret: string): PrincipalPublic {
  void secret;
  throw new NutritionProfileForbiddenError('Nutrition credentials are retired.');
}

export function resolveNutritionPrincipal(
  principalId: string,
  accessVersion: number,
): PrincipalPublic | null {
  const record = db()
    .select()
    .from(nutritionPrincipals)
    .where(eq(nutritionPrincipals.id, principalId))
    .get();
  return !record || record.archivedAt || record.accessVersion !== accessVersion
    ? null
    : publicPrincipal(record);
}

export function createManagedNutritionProfile(requesterPrincipalId: string, rawProfile: unknown) {
  const input = nutritionProfileInputSchema.parse(rawProfile);
  if (!input.linkedHouseholdProfileId) {
    throw new NutritionProfileForbiddenError(
      'Nutrition profiles are provisioned from household profiles only.',
    );
  }
  if (input.profileType === 'adult') {
    throw new NutritionProfileForbiddenError(
      'An adult Nutrition profile must use its own profile-scoped record.',
    );
  }
  const database = db();
  const principal = required(
    database
      .select()
      .from(nutritionPrincipals)
      .where(eq(nutritionPrincipals.id, requesterPrincipalId))
      .get(),
    'Nutrition principal was not found.',
  );
  if (principal.archivedAt) {
    throw new NutritionProfileForbiddenError('Nutrition principal is archived.');
  }
  const now = new Date();
  const profile = {
    id: randomUUID(),
    ...profileValues(input, requesterPrincipalId, now),
    linkedHouseholdProfileId: input.linkedHouseholdProfileId,
    version: 1,
    archivedAt: null,
    createdAt: now,
  } satisfies typeof nutritionProfiles.$inferInsert;
  database.insert(nutritionProfiles).values(profile).run();
  return profile;
}

export function listAccessibleNutritionProfiles(
  requesterPrincipalId: string,
): AccessibleNutritionProfile[] {
  const database = db();
  const principal = required(
    database
      .select()
      .from(nutritionPrincipals)
      .where(eq(nutritionPrincipals.id, requesterPrincipalId))
      .get(),
    'Nutrition principal was not found.',
  );
  if (principal.archivedAt) {
    throw new NutritionProfileForbiddenError('Nutrition principal is archived.');
  }
  const owned = database
    .select({ id: nutritionProfiles.id })
    .from(nutritionProfiles)
    .where(
      and(
        eq(nutritionProfiles.ownerPrincipalId, requesterPrincipalId),
        isNull(nutritionProfiles.archivedAt),
      ),
    )
    .get();
  if (!owned) throw new NutritionProfileForbiddenError('Active Nutrition profile was not found.');
  return database
    .select()
    .from(nutritionProfiles)
    .where(isNull(nutritionProfiles.archivedAt))
    .all()
    .flatMap((profile): AccessibleNutritionProfile[] => {
      const owner = profile.ownerPrincipalId === requesterPrincipalId;
      return [
        {
          id: profile.id,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          profileType: profile.profileType,
          measurementSystem: profile.measurementSystem,
          preferredEnergyUnit: profile.preferredEnergyUnit,
          dailyResetTimezone: profile.dailyResetTimezone,
          visibleNutrientCodes: visibleNutrientCodes(profile.visibleNutrientCodes),
          trendRangeDays: profile.trendRangeDays as 7 | 14 | 30,
          showPlannedNutrition: profile.showPlannedNutrition,
          showRecipeCardNutrition: profile.showRecipeCardNutrition,
          recipeCardNutrientCodes: recipeCardNutrientCodes(profile.recipeCardNutrientCodes),
          showMealPlanNutrition: profile.showMealPlanNutrition,
          relationship: owner ? 'owner' : 'viewer',
          canViewDiary: owner,
          canViewMeasurements: owner,
          canManageProfile: owner,
          canManageGoals: owner,
          canViewComparison: true,
          canExportData: false,
          canDeleteData: false,
          version: profile.version,
        },
      ];
    });
}

export function selectAccessibleNutritionProfile(
  profiles: readonly AccessibleNutritionProfile[],
  requestedProfileId: string | undefined,
) {
  return profiles.find((profile) => profile.id === requestedProfileId) ?? profiles[0] ?? null;
}
export function authenticateNutritionPrincipal(
  principalId: string,
  secret: string,
): PrincipalPublic | null {
  void principalId;
  void secret;
  return null;
}
export function rotateNutritionAccessSecret(
  principalId: string,
  currentSecret: string,
  nextSecret: string,
  expectedAccessVersion: number,
): PrincipalPublic {
  void principalId;
  void currentSecret;
  void nextSecret;
  void expectedAccessVersion;
  throw new NutritionProfileForbiddenError('Nutrition credentials are retired.');
}
export function getPrivateNutritionProfile(profileId: string, requesterPrincipalId: string) {
  return authorize(db(), profileId, requesterPrincipalId, 'manage_profile');
}
export function getSharedNutritionProfile(profileId: string, requesterPrincipalId: string) {
  return authorizeSharedRead(db(), profileId, requesterPrincipalId, 'view_comparison');
}
export function updateNutritionProfileSettings(
  profileId: string,
  requesterPrincipalId: string,
  expectedVersion: number,
  rawProfile: unknown,
) {
  const input = nutritionProfileSettingsInputSchema.parse(rawProfile);
  const database = db();
  const current = authorize(database, profileId, requesterPrincipalId, 'manage_profile');
  const now = new Date();
  if (current.version !== expectedVersion)
    throw new NutritionProfileConflictError('Nutrition profile changed concurrently.');
  const result = database
    .update(nutritionProfiles)
    .set({
      ...profileSettingsValues(input, now),
      version: expectedVersion + 1,
    })
    .where(and(eq(nutritionProfiles.id, profileId), eq(nutritionProfiles.version, expectedVersion)))
    .run();
  if (result.changes !== 1)
    throw new NutritionProfileConflictError('Nutrition profile changed concurrently.');
  return database
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.id, profileId))
    .get()!;
}

export type PermissionInput = Omit<NutritionPermissionGrant, 'principalId'> & {
  principalId: string;
};
export function appendNutritionPermission(
  profileId: string,
  requesterPrincipalId: string,
  input: PermissionInput,
  state: 'granted' | 'revoked' = 'granted',
) {
  void profileId;
  void requesterPrincipalId;
  void input;
  void state;
  throw new NutritionProfileForbiddenError('Nutrition permissions are retired.');
}
export function revokeNutritionPermission(
  profileId: string,
  requesterPrincipalId: string,
  principalId: string,
) {
  return appendNutritionPermission(
    profileId,
    requesterPrincipalId,
    {
      principalId,
      role: 'viewer',
      canViewDiary: false,
      canViewMeasurements: false,
      canManageProfile: false,
      canManageGoals: false,
      canViewComparison: false,
      canExportData: false,
      canDeleteData: false,
      expiresAt: null,
    },
    'revoked',
  );
}

export function listNutritionPermissionVersions(profileId: string, requesterPrincipalId: string) {
  const database = db();
  const profile = authorize(database, profileId, requesterPrincipalId, 'manage_profile');
  if (profile.ownerPrincipalId !== requesterPrincipalId) {
    throw new NutritionProfileForbiddenError(
      'Only the Nutrition profile owner may inspect sharing history.',
    );
  }
  return database
    .select()
    .from(nutritionPermissionVersions)
    .where(eq(nutritionPermissionVersions.nutritionProfileId, profileId))
    .orderBy(nutritionPermissionVersions.principalId, nutritionPermissionVersions.revision)
    .all();
}

export function appendNutritionGoalVersion(
  profileId: string,
  actorInput: NutritionMutationActorInput,
  raw: NutritionGoalVersionInput,
  options: { seriesId?: string; supersedesGoalVersionId?: string | null } = {},
) {
  const input = nutritionGoalVersionInputSchema.parse(raw);
  const database = db();
  const actor = resolveNutritionMutationActor(actorInput, database);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  authorize(database, profileId, requesterPrincipalId, 'manage_goals');
  return database.transaction((transaction) => {
    resolveNutritionMutationActor(actor, transaction);
    const previous = options.supersedesGoalVersionId
      ? required(
          transaction
            .select()
            .from(nutritionGoalVersions)
            .where(eq(nutritionGoalVersions.id, options.supersedesGoalVersionId))
            .get(),
          'Superseded goal version was not found.',
        )
      : undefined;
    if (previous && previous.nutritionProfileId !== profileId)
      throw new NutritionProfileConflictError('Goal version belongs to another Nutrition profile.');
    const seriesId = previous?.seriesId ?? options.seriesId ?? randomUUID();
    const latest = transaction
      .select()
      .from(nutritionGoalVersions)
      .where(eq(nutritionGoalVersions.seriesId, seriesId))
      .orderBy(desc(nutritionGoalVersions.revision))
      .get();
    if (latest && (!previous || latest.id !== previous.id))
      throw new NutritionProfileConflictError('A goal update must supersede its latest version.');
    const row = {
      id: input.id ?? randomUUID(),
      nutritionProfileId: profileId,
      seriesId,
      revision: (latest?.revision ?? 0) + 1,
      nutrientCode: input.nutrientCode,
      unit: input.unit,
      sourceType: input.sourceType,
      sourceReferenceId: input.sourceReferenceId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      state: input.state,
      kind: input.kind,
      value: input.kind === 'target' || input.kind === 'minimum' ? input.value : null,
      minimum: input.kind === 'range' ? input.minimum : null,
      maximum: input.kind === 'range' || input.kind === 'limit' ? input.maximum : null,
      note: input.note,
      supersedesGoalVersionId: previous?.id ?? null,
      createdByPrincipalId: requesterPrincipalId,
      actorHouseholdProfileId: actor.householdProfileId,
      createdAt: new Date(),
    } satisfies typeof nutritionGoalVersions.$inferInsert;
    transaction.insert(nutritionGoalVersions).values(row).run();
    return row;
  });
}
export function listNutritionGoalVersions(profileId: string, requesterPrincipalId: string) {
  authorizeSharedRead(db(), profileId, requesterPrincipalId, 'view_comparison');
  return db()
    .select()
    .from(nutritionGoalVersions)
    .where(eq(nutritionGoalVersions.nutritionProfileId, profileId))
    .orderBy(nutritionGoalVersions.seriesId, nutritionGoalVersions.revision)
    .all();
}
export function recordBodyMeasurement(
  profileId: string,
  actorInput: NutritionMutationActorInput,
  raw: BodyMeasurementInput,
) {
  const input = bodyMeasurementInputSchema.parse(raw);
  const database = db();
  const actor = resolveNutritionMutationActor(actorInput, database);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  authorize(database, profileId, requesterPrincipalId, 'manage_profile');
  const row = {
    id: randomUUID(),
    nutritionProfileId: profileId,
    measuredAt: new Date(input.measuredAt),
    weightKilograms: input.weightKilograms,
    sourceType: input.sourceType,
    approximate: input.approximate,
    note: input.note,
    createdByPrincipalId: requesterPrincipalId,
    actorHouseholdProfileId: actor.householdProfileId,
    createdAt: new Date(),
  } satisfies typeof nutritionBodyMeasurements.$inferInsert;
  database.insert(nutritionBodyMeasurements).values(row).run();
  return row;
}
export function listBodyMeasurements(profileId: string, requesterPrincipalId: string) {
  authorizeSharedRead(db(), profileId, requesterPrincipalId, 'view_measurements');
  return db()
    .select()
    .from(nutritionBodyMeasurements)
    .where(eq(nutritionBodyMeasurements.nutritionProfileId, profileId))
    .orderBy(desc(nutritionBodyMeasurements.measuredAt))
    .all();
}
