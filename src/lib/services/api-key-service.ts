import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth/server';
import { getDatabase } from '@/lib/db/client';
import { apikey } from '@/lib/db/schema';
import { apiPermissionsSchema, type ApiPermissions } from '@/lib/domain/auth';
import { recordSecurityEvent } from '@/lib/services/auth-service';

export type ApiKeyDto = {
  id: string;
  name: string;
  prefix: string;
  start: string;
  enabled: boolean;
  permissions: ApiPermissions;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  rateLimit: { requests: number; windowMs: number };
};

function parsePermissions(value: string | null): ApiPermissions {
  if (!value) return {};
  try {
    const parsed = apiPermissionsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function toDto(row: typeof apikey.$inferSelect): ApiKeyDto {
  return {
    id: row.id,
    name: row.name ?? 'Unnamed key',
    prefix: row.prefix ?? 'bord_sk_',
    start: row.start ?? row.prefix ?? 'bord_sk_',
    enabled: row.enabled,
    permissions: parsePermissions(row.permissions),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastUsedAt: row.lastRequest?.toISOString() ?? null,
    rateLimit: {
      requests: row.rateLimitMax ?? 120,
      windowMs: row.rateLimitTimeWindow ?? 60_000,
    },
  };
}

function ownedKey(userId: string, keyId: string): typeof apikey.$inferSelect {
  const row = getDatabase()
    .select()
    .from(apikey)
    .where(and(eq(apikey.id, keyId), eq(apikey.referenceId, userId)))
    .get();
  if (!row) throw new Error('That API key does not exist.');
  return row;
}

export function listAdminApiKeys(userId: string): ApiKeyDto[] {
  return getDatabase()
    .select()
    .from(apikey)
    .where(eq(apikey.referenceId, userId))
    .orderBy(desc(apikey.createdAt))
    .all()
    .map(toDto);
}

export async function createAdminApiKey(input: {
  userId: string;
  profileId: string;
  name: string;
  expiresInDays: number;
  permissions: ApiPermissions;
  requestId?: string;
}): Promise<{ apiKey: ApiKeyDto; secret: string }> {
  const created = await auth.api.createApiKey({
    body: {
      userId: input.userId,
      name: input.name,
      expiresIn: input.expiresInDays * 24 * 60 * 60,
      permissions: input.permissions,
      rateLimitEnabled: true,
      rateLimitTimeWindow: 60_000,
      rateLimitMax: 120,
      metadata: { managedBy: 'bord-admin-api' },
    },
  });
  recordSecurityEvent({
    userId: input.userId,
    profileId: input.profileId,
    apiKeyId: created.id,
    event: 'api_key_created',
    requestId: input.requestId,
    details: { name: created.name, expiresAt: created.expiresAt?.toISOString() ?? null },
  });
  return {
    apiKey: toDto(ownedKey(input.userId, created.id)),
    secret: created.key,
  };
}

export function updateAdminApiKey(input: {
  userId: string;
  profileId: string;
  keyId: string;
  name?: string;
  enabled?: boolean;
  expiresInDays?: number;
  permissions?: ApiPermissions;
  requestId?: string;
}): ApiKeyDto {
  ownedKey(input.userId, input.keyId);
  const now = new Date();
  getDatabase()
    .update(apikey)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.expiresInDays !== undefined
        ? { expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1_000) }
        : {}),
      ...(input.permissions !== undefined
        ? { permissions: JSON.stringify(input.permissions) }
        : {}),
      updatedAt: now,
    })
    .where(and(eq(apikey.id, input.keyId), eq(apikey.referenceId, input.userId)))
    .run();
  recordSecurityEvent({
    userId: input.userId,
    profileId: input.profileId,
    apiKeyId: input.keyId,
    event: 'api_key_updated',
    requestId: input.requestId,
    details: {
      changed: Object.keys(input).filter(
        (key) => !['userId', 'profileId', 'keyId', 'requestId'].includes(key),
      ),
    },
  });
  return toDto(ownedKey(input.userId, input.keyId));
}

export function revokeAdminApiKey(input: {
  userId: string;
  profileId: string;
  keyId: string;
  requestId?: string;
}): ApiKeyDto {
  const apiKey = updateAdminApiKey({
    ...input,
    enabled: false,
  });
  recordSecurityEvent({
    userId: input.userId,
    profileId: input.profileId,
    apiKeyId: input.keyId,
    event: 'api_key_revoked',
    requestId: input.requestId,
  });
  return apiKey;
}

export async function rotateAdminApiKey(input: {
  userId: string;
  profileId: string;
  keyId: string;
  requestId?: string;
}): Promise<{ apiKey: ApiKeyDto; secret: string; revokedKeyId: string }> {
  const current = ownedKey(input.userId, input.keyId);
  const daysRemaining = current.expiresAt
    ? Math.max(1, Math.min(365, Math.ceil((current.expiresAt.getTime() - Date.now()) / 86_400_000)))
    : 90;
  const replacement = await createAdminApiKey({
    userId: input.userId,
    profileId: input.profileId,
    name: `${current.name ?? 'Integration'} (rotated)`.slice(0, 64),
    expiresInDays: daysRemaining,
    permissions: parsePermissions(current.permissions),
    requestId: input.requestId,
  });
  getDatabase()
    .update(apikey)
    .set({ enabled: false, updatedAt: new Date() })
    .where(and(eq(apikey.id, current.id), eq(apikey.referenceId, input.userId)))
    .run();
  recordSecurityEvent({
    userId: input.userId,
    profileId: input.profileId,
    apiKeyId: replacement.apiKey.id,
    event: 'api_key_rotated',
    requestId: input.requestId,
    details: { revokedKeyId: current.id },
  });
  return { ...replacement, revokedKeyId: current.id };
}
