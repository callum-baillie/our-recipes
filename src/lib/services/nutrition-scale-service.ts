import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Session } from 'tsvesync';
import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { nutritionScaleConnections, integrationAccounts } from '@/lib/db/schema';
import {
  connectVeSync,
  readVeSyncScale,
  VeSyncScaleError,
  type ScaleChoice,
  type ScaleReading,
  type vesyncCredentialsSchema,
} from '@/lib/providers/vesync-scale';
import type { z } from 'zod';

export const SCALE_ONBOARDING_COOKIE = 'bord_scale_onboarding';
export function scaleBindingHash(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
function encryptionKey() {
  return createHash('sha256').update(`bord-vesync-v1:${getRuntimeConfig().auth.secret}`).digest();
}
export function encryptScaleSession(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptScaleSession(value: string): {
  session: Session;
  choices: ScaleChoice[];
  reading?: ScaleReading;
  ownerUserId?: string;
} {
  try {
    const bytes = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
    );
  } catch {
    throw new VeSyncScaleError('The saved VeSync session cannot be read. Please reconnect.', 409);
  }
}
export function verifiedScaleReading(
  encryptedSession: string,
  weight: number | null,
  measuredAt: string | null,
) {
  const reading = decryptScaleSession(encryptedSession).reading;
  return reading && reading.weightKilograms === weight && reading.measuredAt === measuredAt
    ? reading
    : null;
}
const readingRequests = new Set<string>();
async function guardedRead(id: string, session: Session, config: string) {
  if (readingRequests.has(id))
    throw new VeSyncScaleError('A scale sync is already running. Please wait.', 429);
  readingRequests.add(id);
  try {
    return await readVeSyncScale(session, config);
  } finally {
    readingRequests.delete(id);
  }
}
let active = 0;
const attempts: number[] = [];
export async function stageScaleConnection(
  input: z.infer<typeof vesyncCredentialsSchema>,
  binding: string,
  ownerUserId?: string,
) {
  const now = Date.now();
  while (attempts.length && attempts[0]! < now - 60_000) attempts.shift();
  if (active >= 2 || attempts.length >= 10)
    throw new VeSyncScaleError('Please wait a minute before trying VeSync again.', 429);
  attempts.push(now);
  active++;
  try {
    const connected = await connectVeSync(input);
    ensureDatabase();
    const db = getDatabase();
    db.delete(nutritionScaleConnections)
      .where(
        and(
          isNull(nutritionScaleConnections.nutritionProfileId),
          lt(nutritionScaleConnections.pendingExpiresAt, new Date()),
        ),
      )
      .run();
    const id = randomUUID();
    db.insert(nutritionScaleConnections)
      .values({
        id,
        bindingHash: scaleBindingHash(binding),
        encryptedSession: encryptScaleSession({
          ...connected,
          ...(ownerUserId ? { ownerUserId } : {}),
        }),
        pendingExpiresAt: new Date(now + 30 * 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return { connectionId: id, devices: connected.choices };
  } finally {
    active--;
  }
}
function pending(id: string, binding: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(nutritionScaleConnections)
    .where(
      and(
        eq(nutritionScaleConnections.id, id),
        eq(nutritionScaleConnections.bindingHash, scaleBindingHash(binding)),
        isNull(nutritionScaleConnections.nutritionProfileId),
      ),
    )
    .get();
  if (!row || row.pendingExpiresAt.getTime() < Date.now())
    throw new VeSyncScaleError('This VeSync setup has expired. Reconnect to continue.', 409);
  return row;
}
export async function previewScaleConnection(id: string, binding: string, config: string) {
  const row = pending(id, binding);
  const saved = decryptScaleSession(row.encryptedSession);
  if (!saved.choices.some((choice) => choice.config === config))
    throw new VeSyncScaleError('Choose a scale from this account.', 400);
  const readings = await guardedRead(id, saved.session, config);
  pending(id, binding);
  const latest = [
    ...new Map(
      readings
        .map((row) => row.userId)
        .map((userId) => [userId, readings.find((row) => row.userId === userId)!]),
    ).values(),
  ];
  getDatabase()
    .update(nutritionScaleConnections)
    .set({
      deviceConfig: config,
      selectedUser: null,
      encryptedSession: encryptScaleSession({
        session: saved.session,
        choices: saved.choices,
        ownerUserId: saved.ownerUserId,
      }),
      updatedAt: new Date(),
    })
    .where(eq(nutritionScaleConnections.id, id))
    .run();
  return { readings: latest };
}
export async function selectScaleUser(id: string, binding: string, userId: string) {
  const row = pending(id, binding);
  if (!row.deviceConfig) throw new VeSyncScaleError('Choose your scale first.', 400);
  const reading = (
    await guardedRead(row.id, decryptScaleSession(row.encryptedSession).session, row.deviceConfig)
  ).find((reading) => reading.userId === userId);
  if (!reading)
    throw new VeSyncScaleError('No valid measurements were found for that scale user.', 404);
  const current = pending(id, binding);
  if (current.deviceConfig !== row.deviceConfig)
    throw new VeSyncScaleError('The selected scale changed. Choose a measurement again.', 409);
  getDatabase()
    .update(nutritionScaleConnections)
    .set({
      selectedUser: userId,
      encryptedSession: encryptScaleSession({
        ...decryptScaleSession(row.encryptedSession),
        reading,
      }),
      updatedAt: new Date(),
    })
    .where(eq(nutritionScaleConnections.id, id))
    .run();
  return { reading };
}
export function discardScaleConnection(id: string, binding: string) {
  const row = pending(id, binding);
  getDatabase()
    .delete(nutritionScaleConnections)
    .where(eq(nutritionScaleConnections.id, row.id))
    .run();
}
export async function latestLinkedScaleReading(profileId: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(nutritionScaleConnections)
    .where(eq(nutritionScaleConnections.nutritionProfileId, profileId))
    .get();
  if (!row || row.selectedUser === null)
    throw new VeSyncScaleError('Connect your scale in Settings → Integrations.', 404);
  const reading = (
    await guardedRead(row.id, sessionForScaleConnection(row), row.deviceConfig)
  ).find((reading) => reading.userId === row.selectedUser);
  if (!reading)
    throw new VeSyncScaleError('No measurements are available for your selected scale user.', 404);
  return reading;
}

export function sessionForScaleConnection(row: typeof nutritionScaleConnections.$inferSelect) {
  if (!row.accountId) return decryptScaleSession(row.encryptedSession).session;
  const account = getDatabase()
    .select()
    .from(integrationAccounts)
    .where(eq(integrationAccounts.id, row.accountId))
    .get();
  if (!account)
    throw new VeSyncScaleError('Reconnect this integration in Settings → Integrations.', 409);
  return decryptScaleSession(account.encryptedSession).session;
}
