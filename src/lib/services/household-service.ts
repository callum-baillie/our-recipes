import { and, asc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { households, nutritionPrincipals, nutritionProfiles, profiles } from '@/lib/db/schema';
import {
  defaultOnboardingNutrition,
  householdSettingsSchema,
  profileInputSchema,
  setupSchema,
  type HouseholdSettingsInput,
  type OnboardingNutritionInput,
  type ProfileInput,
  type ProfileOnboardingInput,
  type SetupInput,
} from '@/lib/domain/setup';
import { defaultProfileGoalContext } from '@/lib/domain/profile-goals';

export type HouseholdRecord = typeof households.$inferSelect;
export type ProfileRecord = typeof profiles.$inferSelect;

export type HouseholdState = {
  household: HouseholdRecord | null;
  profiles: ProfileRecord[];
};

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

type Db = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function synchronizeHouseholdNutritionProfile(transaction: Tx, profile: ProfileRecord): void {
  const existing = transaction
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.linkedHouseholdProfileId, profile.id))
    .get();
  if (existing) {
    transaction
      .update(nutritionProfiles)
      .set({
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? '',
        archivedAt: profile.archivedAt,
        version: existing.version + 1,
        updatedAt: profile.updatedAt,
      })
      .where(eq(nutritionProfiles.id, existing.id))
      .run();
    return;
  }
  const principalId = profile.id;
  if (
    transaction
      .select()
      .from(nutritionPrincipals)
      .where(eq(nutritionPrincipals.id, principalId))
      .get() ||
    transaction.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, profile.id)).get()
  ) {
    throw new ConflictError('Deterministic household Nutrition identifiers already exist.');
  }
  transaction
    .insert(nutritionPrincipals)
    .values({
      id: principalId,
      credentialHash: 'retired:actor-context-only:v1',
      accessVersion: 1,
      archivedAt: profile.archivedAt,
      lastAuthenticatedAt: null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    })
    .run();
  transaction
    .insert(nutritionProfiles)
    .values({
      id: profile.id,
      ownerPrincipalId: principalId,
      linkedHouseholdProfileId: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? '',
      profileType: 'adult',
      measurementSystem: profile.units,
      nutritionGoalType: 'none',
      comparisonVisibility: 'named',
      diaryVisibility: 'private',
      preferredEnergyUnit: 'kcal',
      dailyResetTimezone: profile.timezone,
      weekStartsOn: 1,
      referenceJurisdiction: 'US',
      version: 1,
      archivedAt: profile.archivedAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    })
    .run();
}

function applyNutritionOnboarding(
  transaction: Tx,
  profileId: string,
  input: OnboardingNutritionInput | undefined,
): void {
  if (!input) return;
  const current = transaction
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.linkedHouseholdProfileId, profileId))
    .get();
  if (!current) throw new ConflictError('The linked Nutrition profile could not be created.');
  transaction
    .update(nutritionProfiles)
    .set({
      profileType: input.profileType,
      dateOfBirth: input.dateOfBirth || null,
      heightCentimeters: input.heightCentimeters,
      currentWeightKilograms: input.currentWeightKilograms,
      referenceSexCategory: input.referenceSexCategory,
      activityLevel: input.activityLevel,
      nutritionGoalType: input.nutritionGoalType,
      dietaryPreferences: JSON.stringify(input.dietaryPreferences),
      foodAllergies: JSON.stringify(input.foodAllergies),
      dietaryExclusions: JSON.stringify(input.dietaryExclusions),
      weightTrackingEnabled: input.weightTrackingEnabled,
      estimatedTargetsEnabled: input.estimatedTargetsEnabled,
      estimatedTargetConsent: input.estimatedTargetConsent,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(nutritionProfiles.id, current.id))
    .run();
}

export function listProfiles(includeArchived = false): ProfileRecord[] {
  const query = getDatabase().select().from(profiles);
  return (includeArchived ? query : query.where(isNull(profiles.archivedAt)))
    .orderBy(asc(profiles.createdAt))
    .all();
}

export function getHouseholdState(includeArchived = false): HouseholdState {
  ensureDatabase();
  return {
    household: getDatabase().select().from(households).limit(1).get() ?? null,
    profiles: listProfiles(includeArchived),
  };
}

export function completeSetup(input: SetupInput): HouseholdState {
  ensureDatabase();
  const db = getDatabase();
  const existing = db.select({ id: households.id }).from(households).limit(1).get();
  if (existing) throw new ConflictError('This household has already been set up.');

  const canonicalInput = setupSchema.parse(input);
  const now = new Date();
  const profileInputs: ProfileOnboardingInput[] = [
    {
      profile: canonicalInput.profile,
      nutrition: canonicalInput.nutrition ?? defaultOnboardingNutrition,
    },
    ...canonicalInput.additionalProfiles,
  ];
  db.transaction((transaction) => {
    transaction
      .insert(households)
      .values({
        id: randomUUID(),
        kitchenName: canonicalInput.kitchenName,
        kitchenIcon: canonicalInput.kitchenIcon,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    profileInputs.forEach((entry, index) => {
      const profileId = randomUUID();
      const profileCreatedAt = new Date(now.getTime() + index);
      transaction
        .insert(profiles)
        .values({
          id: profileId,
          displayName: entry.profile.displayName,
          color: entry.profile.color,
          avatarUrl: entry.profile.avatarUrl || null,
          units: entry.profile.units,
          temperatureUnit: entry.profile.temperatureUnit,
          locale: entry.profile.locale,
          timezone: entry.profile.timezone,
          mainGoals: entry.profile.mainGoals ?? '',
          goalContext: entry.profile.goalContext ?? defaultProfileGoalContext,
          archivedAt: null,
          createdAt: profileCreatedAt,
          updatedAt: profileCreatedAt,
        })
        .run();
      const profile = transaction.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
      synchronizeHouseholdNutritionProfile(transaction, profile);
      applyNutritionOnboarding(transaction, profile.id, entry.nutrition);
    });
  });
  return getHouseholdState();
}

export function updateHouseholdSettings(input: HouseholdSettingsInput): HouseholdRecord {
  ensureDatabase();
  const db = getDatabase();
  const household = db.select().from(households).limit(1).get();
  if (!household) throw new ConflictError('Set up the household before changing app settings.');
  const canonicalInput = householdSettingsSchema.parse(input);
  db.update(households)
    .set({
      kitchenName: canonicalInput.kitchenName,
      kitchenIcon: canonicalInput.kitchenIcon,
      updatedAt: new Date(),
    })
    .where(eq(households.id, household.id))
    .run();
  return db.select().from(households).where(eq(households.id, household.id)).get()!;
}

function addProfileInternal(
  rawInput: ProfileInput,
  nutrition?: OnboardingNutritionInput,
): ProfileRecord {
  ensureDatabase();
  const household = getDatabase().select({ id: households.id }).from(households).limit(1).get();
  if (!household) throw new ConflictError('Set up the household before adding profiles.');

  const input = profileInputSchema.parse(rawInput);
  const now = new Date();
  const profile: ProfileRecord = {
    id: randomUUID(),
    displayName: input.displayName,
    color: input.color,
    avatarUrl: input.avatarUrl || null,
    units: input.units,
    temperatureUnit: input.temperatureUnit,
    locale: input.locale,
    timezone: input.timezone,
    mainGoals: input.mainGoals ?? '',
    goalContext: input.goalContext ?? defaultProfileGoalContext,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  getDatabase().transaction((transaction) => {
    transaction.insert(profiles).values(profile).run();
    synchronizeHouseholdNutritionProfile(transaction, profile);
    applyNutritionOnboarding(transaction, profile.id, nutrition);
  });
  return profile;
}

export function addProfile(input: ProfileInput): ProfileRecord {
  return addProfileInternal(input);
}

export function onboardProfile(input: ProfileOnboardingInput): ProfileRecord {
  return addProfileInternal(input.profile, input.nutrition);
}

export function getProfile(profileId: string): ProfileRecord | null {
  ensureDatabase();
  return (
    getDatabase()
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), isNull(profiles.archivedAt)))
      .get() ?? null
  );
}

export function updateProfile(profileId: string, input: ProfileInput): ProfileRecord {
  ensureDatabase();
  const db = getDatabase();
  const existing = db.select().from(profiles).where(eq(profiles.id, profileId)).get();
  if (!existing) throw new NotFoundError('That household profile no longer exists.');
  const updatedAt = new Date();
  db.transaction((transaction) => {
    transaction
      .update(profiles)
      .set({
        displayName: input.displayName,
        color: input.color,
        avatarUrl: input.avatarUrl || null,
        units: input.units,
        temperatureUnit: input.temperatureUnit,
        locale: input.locale,
        timezone: input.timezone,
        mainGoals: input.mainGoals ?? existing.mainGoals,
        goalContext: input.goalContext ?? existing.goalContext,
        updatedAt,
      })
      .where(eq(profiles.id, profileId))
      .run();
    const updated = transaction.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
    synchronizeHouseholdNutritionProfile(transaction, updated);
  });
  return db.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
}

export function setProfileArchived(profileId: string, archived: boolean): ProfileRecord {
  ensureDatabase();
  const db = getDatabase();
  const existing = db.select().from(profiles).where(eq(profiles.id, profileId)).get();
  if (!existing) throw new NotFoundError('That household profile no longer exists.');
  if (archived && !existing.archivedAt && listProfiles().length <= 1) {
    throw new ConflictError('Keep at least one active household profile.');
  }
  db.transaction((transaction) => {
    transaction
      .update(profiles)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(profiles.id, profileId))
      .run();
    const updated = transaction.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
    synchronizeHouseholdNutritionProfile(transaction, updated);
  });
  return db.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
}
