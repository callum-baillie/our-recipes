import { and, asc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { households, profiles } from '@/lib/db/schema';
import type { ProfileInput, SetupInput } from '@/lib/domain/setup';

export type HouseholdRecord = typeof households.$inferSelect;
export type ProfileRecord = typeof profiles.$inferSelect;

export type HouseholdState = {
  household: HouseholdRecord | null;
  profiles: ProfileRecord[];
};

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

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

  const now = new Date();
  const profileId = randomUUID();
  db.transaction((transaction) => {
    transaction
      .insert(households)
      .values({
        id: randomUUID(),
        name: input.householdName,
        appName: input.appName,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    transaction
      .insert(profiles)
      .values({
        id: profileId,
        displayName: input.profile.displayName,
        color: input.profile.color,
        avatarUrl: input.profile.avatarUrl || null,
        units: input.profile.units,
        temperatureUnit: input.profile.temperatureUnit,
        locale: input.profile.locale,
        timezone: input.profile.timezone,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return getHouseholdState();
}

export function addProfile(input: ProfileInput): ProfileRecord {
  ensureDatabase();
  const household = getDatabase().select({ id: households.id }).from(households).limit(1).get();
  if (!household) throw new ConflictError('Set up the household before adding profiles.');

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
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  getDatabase().insert(profiles).values(profile).run();
  return profile;
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
  db.update(profiles)
    .set({
      displayName: input.displayName,
      color: input.color,
      avatarUrl: input.avatarUrl || null,
      units: input.units,
      temperatureUnit: input.temperatureUnit,
      locale: input.locale,
      timezone: input.timezone,
      updatedAt,
    })
    .where(eq(profiles.id, profileId))
    .run();
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
  db.update(profiles)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(profiles.id, profileId))
    .run();
  return db.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
}
