import 'server-only';
import { refreshCurrentNutritionWeight } from './nutrition-profile-service';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  integrationAccounts,
  nutritionScaleConnections,
  nutritionProfiles,
  nutritionBodyMeasurements,
  profileAuthLinks,
  profiles,
  user,
} from '@/lib/db/schema';
import {
  decryptScaleSession,
  encryptScaleSession,
  stageScaleConnection,
  discardScaleConnection,
} from './nutrition-scale-service';
import {
  readVeSyncScale,
  VeSyncScaleError,
  type vesyncCredentialsSchema,
} from '@/lib/providers/vesync-scale';
import type { RequestPrincipal } from './auth-service';
import type { IntegrationState } from '@/lib/domain/integration-settings';
import type { z } from 'zod';

type Account = typeof integrationAccounts.$inferSelect;
type Principal = Pick<RequestPrincipal, 'userId' | 'role' | 'linkedProfileId' | 'profileId'>;
const admin = (p: Principal) => p.role === 'admin' && p.profileId === p.linkedProfileId;
const fail = (message: string, status = 403): never => {
  throw new VeSyncScaleError(message, status);
};

// Preserve the authenticated creator of new onboarding connections. Historical
// connections without ownership are held by the first admin, never handed to a
// destination profile merely because it receives measurements.
export function adoptLegacyScaleConnections() {
  ensureDatabase();
  const db = getDatabase();
  db.transaction((tx) => {
    const legacy = tx
      .select()
      .from(nutritionScaleConnections)
      .where(isNull(nutritionScaleConnections.accountId))
      .all();
    for (const connection of legacy) {
      if (!connection.nutritionProfileId) continue;
      const profile = tx
        .select()
        .from(nutritionProfiles)
        .where(eq(nutritionProfiles.id, connection.nutritionProfileId))
        .get();
      if (!profile?.linkedHouseholdProfileId) continue;
      let creator: string | undefined;
      try {
        creator = decryptScaleSession(connection.encryptedSession).ownerUserId;
      } catch {
        /* Owner can reconnect unreadable credentials. */
      }
      const owner = creator
        ? tx.select({ id: user.id }).from(user).where(eq(user.id, creator)).get()?.id
        : tx
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.role, 'admin'), eq(user.banned, false)))
            .orderBy(asc(user.createdAt), asc(user.id))
            .get()?.id;
      if (!owner) continue;
      let encryptedSession = connection.encryptedSession;
      try {
        const { session, choices } = decryptScaleSession(encryptedSession);
        encryptedSession = encryptScaleSession({ session, choices });
      } catch {
        /* Preserve unreadable sessions so their owner can remove them. */
      }
      tx.insert(integrationAccounts)
        .values({
          id: connection.id,
          ownerUserId: owner,
          label: 'VeSync',
          encryptedSession,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      tx.update(nutritionScaleConnections)
        .set({ accountId: connection.id, encryptedSession: '' })
        .where(eq(nutritionScaleConnections.id, connection.id))
        .run();
    }
  });
}
function owned(id: string, principal: Principal): Account {
  const owner = getDatabase()
    .select({ banned: user.banned })
    .from(user)
    .where(eq(user.id, principal.userId))
    .get();
  if (!owner || owner.banned) return fail('This signed-in account is no longer available.', 403);
  const row = getDatabase()
    .select()
    .from(integrationAccounts)
    .where(
      and(eq(integrationAccounts.id, id), eq(integrationAccounts.ownerUserId, principal.userId)),
    )
    .get();
  if (!row) return fail('This integration does not belong to your signed-in account.', 404);
  return row;
}
function target(id: string, principal: Principal) {
  const currentUser = getDatabase()
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, principal.userId))
    .get();
  if (!currentUser || currentUser.banned)
    return fail('This signed-in account is no longer available.', 403);
  const profile = getDatabase()
    .select()
    .from(nutritionProfiles)
    .where(eq(nutritionProfiles.id, id))
    .get();
  if (!profile || profile.archivedAt || !profile.linkedHouseholdProfileId)
    return fail('Choose an active household nutrition profile.', 404);
  const household = getDatabase()
    .select()
    .from(profiles)
    .where(eq(profiles.id, profile.linkedHouseholdProfileId))
    .get();
  if (!household || household.archivedAt) return fail('This household profile is archived.', 409);
  if (
    !(admin(principal) && currentUser.role === 'admin') &&
    profile.linkedHouseholdProfileId !== principal.linkedProfileId
  )
    return fail('You can connect integrations only to your own profile.');
  return profile;
}
export function integrationState(principal: Principal): IntegrationState {
  adoptLegacyScaleConnections();
  const db = getDatabase();
  const targets = db
    .select({
      id: nutritionProfiles.id,
      name: profiles.displayName,
      weightTrackingEnabled: nutritionProfiles.weightTrackingEnabled,
      householdId: profiles.id,
    })
    .from(nutritionProfiles)
    .innerJoin(profiles, eq(profiles.id, nutritionProfiles.linkedHouseholdProfileId))
    .where(and(isNull(nutritionProfiles.archivedAt), isNull(profiles.archivedAt)))
    .all()
    .filter((p) => admin(principal) || p.householdId === principal.linkedProfileId);
  const names = new Map(targets.map((p) => [p.id, p.name]));
  const connections = db.select().from(nutritionScaleConnections).all();
  const accounts = db
    .select()
    .from(integrationAccounts)
    .where(eq(integrationAccounts.ownerUserId, principal.userId))
    .all();
  const ids = new Set(accounts.map((a) => a.id));
  return {
    canAssignHousehold: admin(principal),
    profiles: targets.map(({ id, name, weightTrackingEnabled }) => ({
      id,
      name,
      weightTrackingEnabled,
    })),
    accounts: accounts.map((a) => {
      let devices: IntegrationState['accounts'][number]['devices'] = [];
      let error = a.lastError;
      try {
        devices = decryptScaleSession(a.encryptedSession).choices;
      } catch {
        error = 'Reconnect this account: its saved session is unavailable.';
      }
      return {
        id: a.id,
        label: a.label,
        provider: a.provider,
        syncIntervalMinutes: a.syncIntervalMinutes,
        lastAttemptAt: a.lastAttemptAt?.toISOString() ?? null,
        lastSuccessAt: a.lastSuccessAt?.toISOString() ?? null,
        nextSyncAt: a.nextSyncAt?.toISOString() ?? null,
        lastError: error,
        syncing: !!a.leaseUntil && a.leaseUntil.getTime() > Date.now(),
        devices,
        mappings: connections
          .filter((c) => c.accountId === a.id)
          .map((c) => ({
            id: c.id,
            profileId: c.nutritionProfileId!,
            profileName: names.get(c.nutritionProfileId!) ?? 'Unavailable profile',
            deviceConfig: c.deviceConfig,
            scaleUserId: c.selectedUser!,
          })),
      };
    }),
    sharedMappings: connections
      .filter(
        (c) =>
          c.accountId &&
          !ids.has(c.accountId) &&
          c.nutritionProfileId &&
          names.has(c.nutritionProfileId),
      )
      .map((c) => ({ id: c.id, profileName: names.get(c.nutritionProfileId!)! })),
  };
}
export async function addIntegration(
  principal: Principal,
  credentials: z.infer<typeof vesyncCredentialsSchema>,
  label: string,
) {
  ensureDatabase();
  if (
    getDatabase()
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.ownerUserId, principal.userId))
      .all().length >= 10
  )
    fail('Remove an unused connection before adding another.', 409);
  // Reuse bounded authentication and encrypted staging; password never persists.
  const binding = randomUUID();
  const staged = await stageScaleConnection(credentials, binding, principal.userId);
  try {
    return getDatabase().transaction((tx) => {
      const stagedRow = tx
        .select()
        .from(nutritionScaleConnections)
        .where(eq(nutritionScaleConnections.id, staged.connectionId))
        .get();
      if (!stagedRow) return fail('The connection expired. Please try again.', 409);
      const id = randomUUID();
      tx.insert(integrationAccounts)
        .values({
          id,
          ownerUserId: principal.userId,
          label,
          encryptedSession: stagedRow.encryptedSession,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      tx.delete(nutritionScaleConnections)
        .where(eq(nutritionScaleConnections.id, staged.connectionId))
        .run();
      return { id };
    });
  } catch (error) {
    try {
      discardScaleConnection(staged.connectionId, binding);
    } catch {}
    throw error;
  }
}
const previews = new Set<string>();
export async function previewIntegration(principal: Principal, id: string, config: string) {
  const account = owned(id, principal);
  const saved = decryptScaleSession(account.encryptedSession);
  if (!saved.choices.some((d) => d.config === config))
    fail('Choose a scale from this connection.', 400);
  if (previews.has(id)) fail('A profile lookup is already running.', 429);
  previews.add(id);
  try {
    const readings = await readVeSyncScale(saved.session, config);
    owned(id, principal);
    const seen = new Set<string>();
    return readings.filter((r) => {
      if (seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    });
  } finally {
    previews.delete(id);
  }
}
export async function assignIntegration(
  principal: Principal,
  id: string,
  config: string,
  scaleUserId: string,
  profileId: string,
) {
  owned(id, principal);
  target(profileId, principal);
  const readings = await previewIntegration(principal, id, config);
  if (!readings.some((r) => r.userId === scaleUserId))
    fail('Choose a VeSync profile returned by this scale.', 400);
  return getDatabase().transaction((tx) => {
    const account = owned(id, principal);
    const profile = target(profileId, principal);
    const existing = tx
      .select()
      .from(nutritionScaleConnections)
      .where(eq(nutritionScaleConnections.nutritionProfileId, profileId))
      .get();
    if (existing)
      fail(
        'Remove the existing profile assignment before connecting a different account or scale profile.',
        409,
      );
    const duplicate = tx
      .select()
      .from(nutritionScaleConnections)
      .where(
        and(
          eq(nutritionScaleConnections.accountId, id),
          eq(nutritionScaleConnections.deviceConfig, config),
          eq(nutritionScaleConnections.selectedUser, scaleUserId),
        ),
      )
      .get();
    if (duplicate)
      fail(
        'This VeSync profile is already assigned. Remove that assignment before moving it.',
        409,
      );
    tx.insert(nutritionScaleConnections)
      .values({
        id: randomUUID(),
        accountId: id,
        nutritionProfileId: profile.id,
        bindingHash: '',
        encryptedSession: '',
        deviceConfig: config,
        selectedUser: scaleUserId,
        pendingExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    tx.update(integrationAccounts)
      .set({
        leaseToken: null,
        leaseUntil: null,
        nextSyncAt: account.syncIntervalMinutes ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(integrationAccounts.id, id))
      .run();
    return { assigned: true };
  });
}
export function updateIntegration(
  principal: Principal,
  id: string,
  label: string,
  interval: number,
) {
  owned(id, principal);
  getDatabase()
    .update(integrationAccounts)
    .set({
      label,
      syncIntervalMinutes: interval,
      nextSyncAt: interval ? new Date(Date.now() + interval * 60000) : null,
      updatedAt: new Date(),
    })
    .where(eq(integrationAccounts.id, id))
    .run();
}
export function removeIntegration(principal: Principal, id: string) {
  owned(id, principal);
  getDatabase().delete(integrationAccounts).where(eq(integrationAccounts.id, id)).run();
}
export function removeAssignment(principal: Principal, id: string) {
  const db = getDatabase();
  db.transaction((tx) => {
    const connection = tx
      .select()
      .from(nutritionScaleConnections)
      .where(eq(nutritionScaleConnections.id, id))
      .get();
    if (!connection?.nutritionProfileId) fail('Assignment not found.', 404);
    const c = connection!;
    const account = c.accountId
      ? tx.select().from(integrationAccounts).where(eq(integrationAccounts.id, c.accountId)).get()
      : null;
    if (account?.ownerUserId !== principal.userId) target(c.nutritionProfileId!, principal);
    tx.delete(nutritionScaleConnections).where(eq(nutritionScaleConnections.id, id)).run();
    if (c.accountId)
      tx.update(integrationAccounts)
        .set({ leaseToken: null, leaseUntil: null, updatedAt: new Date() })
        .where(eq(integrationAccounts.id, c.accountId))
        .run();
  });
}
function authorizedDestinations(account: Account) {
  const db = getDatabase();
  const owner = db.select().from(user).where(eq(user.id, account.ownerUserId)).get();
  if (!owner || owner.banned) return [];
  const link = db
    .select()
    .from(profileAuthLinks)
    .where(eq(profileAuthLinks.userId, owner.id))
    .get();
  if (!link) return [];
  const ownProfile = db.select().from(profiles).where(eq(profiles.id, link.profileId)).get();
  if (!ownProfile || ownProfile.archivedAt) return [];
  return db
    .select({
      connection: nutritionScaleConnections,
      profile: nutritionProfiles,
      household: profiles,
    })
    .from(nutritionScaleConnections)
    .innerJoin(
      nutritionProfiles,
      eq(nutritionProfiles.id, nutritionScaleConnections.nutritionProfileId),
    )
    .innerJoin(profiles, eq(profiles.id, nutritionProfiles.linkedHouseholdProfileId))
    .where(
      and(
        eq(nutritionScaleConnections.accountId, account.id),
        isNull(nutritionProfiles.archivedAt),
        isNull(profiles.archivedAt),
        eq(nutritionProfiles.weightTrackingEnabled, true),
      ),
    )
    .all()
    .filter((r) => owner.role === 'admin' || r.household.id === link.profileId);
}
export async function syncIntegration(id: string, principal?: Principal) {
  ensureDatabase();
  if (principal) owned(id, principal);
  const db = getDatabase();
  const now = new Date();
  const token = randomUUID();
  const account = db
    .update(integrationAccounts)
    .set({ leaseToken: token, leaseUntil: new Date(Date.now() + 15 * 60000), lastAttemptAt: now })
    .where(
      and(
        eq(integrationAccounts.id, id),
        ...(principal
          ? []
          : [
              gt(integrationAccounts.syncIntervalMinutes, 0),
              lte(integrationAccounts.nextSyncAt, now),
            ]),
        or(isNull(integrationAccounts.leaseUntil), lte(integrationAccounts.leaseUntil, now)),
      ),
    )
    .returning()
    .get();
  if (!account) fail('A sync is already running, or the account was removed.', 409);
  const claimed = account!;
  let imported = 0;
  try {
    const destinations = authorizedDestinations(claimed);
    if (!destinations.length)
      fail('Assign a profile with weight tracking enabled before syncing.', 409);
    const saved = decryptScaleSession(claimed.encryptedSession);
    const readings = new Map<string, Awaited<ReturnType<typeof readVeSyncScale>>>();
    for (const config of new Set(destinations.map((d) => d.connection.deviceConfig)))
      readings.set(config, await readVeSyncScale(saved.session, config));
    db.transaction((tx) => {
      const current = tx
        .select()
        .from(integrationAccounts)
        .where(and(eq(integrationAccounts.id, id), eq(integrationAccounts.leaseToken, token)))
        .get();
      if (!current) fail('The integration changed during sync. Please sync again.', 409);
      const valid = authorizedDestinations(current!);
      if (!valid.length)
        fail(
          'All assigned profiles are paused or unavailable. Enable weight tracking before syncing.',
          409,
        );
      const hasMeasurements = (config: string, userId: string | null) =>
        (readings.get(config) ?? []).some((row) => row.userId === userId);
      if (
        !valid.some(({ connection }) =>
          hasMeasurements(connection.deviceConfig, connection.selectedUser),
        )
      )
        fail(
          'No measurements were returned for the assigned VeSync profiles. Open Settings to review the assignments.',
          404,
        );
      const partial = valid.some(
        ({ connection }) => !hasMeasurements(connection.deviceConfig, connection.selectedUser),
      );
      for (const { connection, profile, household } of valid) {
        const original = destinations.find((d) => d.connection.id === connection.id);
        if (
          !original ||
          original.connection.selectedUser !== connection.selectedUser ||
          original.connection.deviceConfig !== connection.deviceConfig
        )
          continue;
        const rows = (readings.get(connection.deviceConfig) ?? []).filter(
          (r) => r.userId === connection.selectedUser,
        );
        for (const reading of rows) {
          const measuredAt = new Date(reading.measuredAt);
          const existing = tx
            .select({ id: nutritionBodyMeasurements.id, note: nutritionBodyMeasurements.note })
            .from(nutritionBodyMeasurements)
            .where(
              and(
                eq(nutritionBodyMeasurements.nutritionProfileId, profile.id),
                eq(nutritionBodyMeasurements.measuredAt, measuredAt),
                eq(nutritionBodyMeasurements.weightKilograms, reading.weightKilograms),
                eq(nutritionBodyMeasurements.sourceType, 'imported'),
              ),
            )
            .get();
          const estimate = reading.compositionEstimate
            ? JSON.stringify(reading.compositionEstimate)
            : null;
          if (existing) {
            if (existing.note?.startsWith('VeSync'))
              tx.update(nutritionBodyMeasurements)
                .set({ bodyCompositionEstimate: estimate })
                .where(eq(nutritionBodyMeasurements.id, existing.id))
                .run();
            continue;
          }
          tx.insert(nutritionBodyMeasurements)
            .values({
              id: randomUUID(),
              nutritionProfileId: profile.id,
              measuredAt,
              weightKilograms: reading.weightKilograms,
              advancedBodyMetrics: JSON.stringify(
                reading.bodyFatPercent === undefined
                  ? {}
                  : { bodyFatPercent: reading.bodyFatPercent },
              ),
              bodyCompositionEstimate: estimate,
              sourceType: 'imported',
              approximate: false,
              note: 'VeSync ESF24',
              createdByPrincipalId: profile.ownerPrincipalId,
              actorHouseholdProfileId: household.id,
              createdAt: new Date(),
            })
            .run();
          imported++;
        }
        refreshCurrentNutritionWeight(profile.id);
      }
      tx.update(integrationAccounts)
        .set({
          lastSuccessAt: new Date(),
          lastError: partial
            ? 'Some assigned VeSync profiles have no available measurements. Open Settings to review the assignments.'
            : null,
          leaseToken: null,
          leaseUntil: null,
          nextSyncAt: current!.syncIntervalMinutes
            ? new Date(Date.now() + current!.syncIntervalMinutes * 60000)
            : null,
        })
        .where(and(eq(integrationAccounts.id, id), eq(integrationAccounts.leaseToken, token)))
        .run();
    });
    return { imported };
  } catch (error) {
    const current = db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, id))
      .get();
    // Save only curated provider messages, never raw responses or credentials.
    const message =
      error instanceof VeSyncScaleError
        ? error.message
        : 'VeSync sync failed. Try again or remove and reconnect this account.';
    db.update(integrationAccounts)
      .set({
        lastError: message,
        leaseToken: null,
        leaseUntil: null,
        nextSyncAt: current?.syncIntervalMinutes
          ? new Date(Date.now() + Math.max(15, current.syncIntervalMinutes) * 60000)
          : null,
      })
      .where(and(eq(integrationAccounts.id, id), eq(integrationAccounts.leaseToken, token)))
      .run();
    throw new VeSyncScaleError(message, error instanceof VeSyncScaleError ? error.status : 502);
  }
}
