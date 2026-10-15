import 'server-only';

import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { parseSessionBoundProfileValue } from '@/lib/actor-context';
import { auth } from '@/lib/auth/server';
import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  account,
  apikey,
  authRecoveryCodes,
  authSecurityEvents,
  passkey,
  profileAuthLinks,
  profilePinAttempts,
  profiles,
  profileSecurity,
  session,
  user,
  verification,
} from '@/lib/db/schema';
import {
  accountRecoverySchema,
  apiPermissionsSchema,
  type ApiAction,
  type ApiPermissions,
  type ApiResource,
  type ProfileCredentialsInput,
} from '@/lib/domain/auth';
import { effectiveAppRole, normalizeAppRole, type AppRole } from '@/lib/domain/permissions';

const PROFILE_PASSWORD_WINDOW_MS = 15 * 60 * 1_000;
const PROFILE_PASSWORD_MAX_ATTEMPTS = 5;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type PreparedProfileEnrollment = {
  user: typeof user.$inferInsert;
  account: typeof account.$inferInsert;
  security: Omit<typeof profileSecurity.$inferInsert, 'profileId'>;
  recoveryRows: Array<Omit<typeof authRecoveryCodes.$inferInsert, 'userId'>>;
  recoveryCodes: string[];
};

export type RequestPrincipal = {
  kind: 'session' | 'api-key';
  userId: string;
  role: AppRole;
  accountRole: AppRole;
  activeProfileRole: AppRole;
  sessionId: string | null;
  apiKeyId: string | null;
  linkedProfileId: string;
  profileId: string;
  apiPermissions?: ApiPermissions;
};

export class RequestAuthError extends Error {
  constructor(
    readonly status: 401 | 403 | 429,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export class AuthorizationConflictError extends Error {
  constructor(
    readonly code: 'last_admin_required' | 'profile_role_conflict',
    message: string,
  ) {
    super(message);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

function recoveryCodeHash(code: string): string {
  return createHmac('sha256', getRuntimeConfig().auth.secret)
    .update(code.trim().toUpperCase())
    .digest('base64url');
}

function randomRecoverySegment(): string {
  let result = '';
  while (result.length < 4) {
    const value = randomBytes(1)[0]!;
    if (value >= RECOVERY_ALPHABET.length * Math.floor(256 / RECOVERY_ALPHABET.length)) continue;
    result += RECOVERY_ALPHABET[value % RECOVERY_ALPHABET.length]!;
  }
  return result;
}

function generateRecoveryCodes(count = 10): string[] {
  return Array.from(
    { length: count },
    () => `BORD-${randomRecoverySegment()}-${randomRecoverySegment()}-${randomRecoverySegment()}`,
  );
}

export async function prepareProfileEnrollment(
  displayName: string,
  credentials: ProfileCredentialsInput,
  role: AppRole,
): Promise<PreparedProfileEnrollment> {
  const now = new Date();
  const userId = randomUUID();
  const passwordHash = await hashPassword(credentials.passphrase);
  const recoveryCodes = generateRecoveryCodes();
  return {
    user: {
      id: userId,
      name: displayName.trim(),
      email: normalizeEmail(credentials.email),
      emailVerified: !getRuntimeConfig().auth.requireEmailVerification,
      image: null,
      role,
      banned: false,
      banReason: null,
      banExpires: null,
      createdAt: now,
      updatedAt: now,
    },
    account: {
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    },
    security: {
      pinSalt: '',
      pinHash: '',
      pinVersion: 0,
      createdAt: now,
      updatedAt: now,
    },
    recoveryRows: recoveryCodes.map((code) => ({
      id: randomUUID(),
      codeHash: recoveryCodeHash(code),
      codePrefix: code.slice(0, 9),
      createdAt: now,
      usedAt: null,
      expiresAt: null,
    })),
    recoveryCodes,
  };
}

export function isAuthenticationConfigured(): boolean {
  ensureDatabase();
  const row = getDatabase()
    .select({ count: count() })
    .from(user)
    .innerJoin(profileAuthLinks, eq(profileAuthLinks.userId, user.id))
    .where(and(eq(user.role, 'admin'), eq(user.banned, false)))
    .get();
  return (row?.count ?? 0) > 0;
}

export function getProfileAccessRole(profileId: string): AppRole | null {
  ensureDatabase();
  const row = getDatabase()
    .select({ role: user.role })
    .from(profileAuthLinks)
    .innerJoin(user, eq(user.id, profileAuthLinks.userId))
    .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
    .where(and(eq(profileAuthLinks.profileId, profileId), isNull(profiles.archivedAt)))
    .get();
  return row ? normalizeAppRole(row.role) : null;
}

export function countActiveAdmins(): number {
  ensureDatabase();
  return (
    getDatabase()
      .select({ value: count() })
      .from(user)
      .innerJoin(profileAuthLinks, eq(profileAuthLinks.userId, user.id))
      .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
      .where(and(eq(user.role, 'admin'), eq(user.banned, false), isNull(profiles.archivedAt)))
      .get()?.value ?? 0
  );
}

export function listProfileAccessAccounts() {
  ensureDatabase();
  const adminCount = countActiveAdmins();
  return getDatabase()
    .select({
      profileId: profiles.id,
      displayName: profiles.displayName,
      color: profiles.color,
      avatarUrl: profiles.avatarUrl,
      archivedAt: profiles.archivedAt,
      userId: user.id,
      email: user.email,
      role: user.role,
      banned: user.banned,
    })
    .from(profiles)
    .innerJoin(profileAuthLinks, eq(profileAuthLinks.profileId, profiles.id))
    .innerJoin(user, eq(user.id, profileAuthLinks.userId))
    .all()
    .map((row) => ({
      ...row,
      role: normalizeAppRole(row.role),
      isLastAdmin:
        normalizeAppRole(row.role) === 'admin' &&
        !row.archivedAt &&
        !row.banned &&
        adminCount === 1,
    }));
}

export function changeProfileAccessRole(input: {
  profileId: string;
  role: AppRole;
  actorUserId: string;
}): ReturnType<typeof listProfileAccessAccounts>[number] {
  ensureDatabase();
  const db = getDatabase();
  const target = db
    .select({ userId: user.id, role: user.role, archivedAt: profiles.archivedAt })
    .from(profileAuthLinks)
    .innerJoin(user, eq(user.id, profileAuthLinks.userId))
    .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
    .where(eq(profileAuthLinks.profileId, input.profileId))
    .get();
  if (!target) {
    throw new AuthorizationConflictError(
      'profile_role_conflict',
      'That secured household profile no longer exists.',
    );
  }
  const currentRole = normalizeAppRole(target.role);
  if (currentRole === 'admin' && input.role !== 'admin' && !target.archivedAt) {
    if (countActiveAdmins() <= 1) {
      throw new AuthorizationConflictError(
        'last_admin_required',
        'Promote another active profile to Admin before changing this role.',
      );
    }
  }
  const now = new Date();
  db.transaction((transaction) => {
    transaction
      .update(user)
      .set({ role: input.role, updatedAt: now })
      .where(eq(user.id, target.userId))
      .run();
    if (currentRole === 'admin' && input.role !== 'admin') {
      transaction
        .update(apikey)
        .set({ enabled: false, updatedAt: now })
        .where(eq(apikey.referenceId, target.userId))
        .run();
    }
    transaction.delete(session).where(eq(session.userId, target.userId)).run();
    transaction
      .insert(authSecurityEvents)
      .values({
        id: randomUUID(),
        userId: input.actorUserId,
        profileId: input.profileId,
        event: 'role_changed',
        details: JSON.stringify({ from: currentRole, to: input.role }),
        createdAt: now,
      })
      .run();
  });
  return listProfileAccessAccounts().find((row) => row.profileId === input.profileId)!;
}

export function authenticationEnrollmentStatus(): {
  configured: boolean;
  profiles: Array<{
    id: string;
    displayName: string;
    color: string;
    avatarUrl: string | null;
    enrolled: boolean;
    email: string | null;
    isAdmin: boolean;
    role: AppRole;
  }>;
} {
  ensureDatabase();
  const rows = getDatabase()
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      color: profiles.color,
      avatarUrl: profiles.avatarUrl,
      userId: profileAuthLinks.userId,
      email: user.email,
      role: user.role,
    })
    .from(profiles)
    .leftJoin(profileAuthLinks, eq(profileAuthLinks.profileId, profiles.id))
    .leftJoin(user, eq(user.id, profileAuthLinks.userId))
    .where(isNull(profiles.archivedAt))
    .all();
  return {
    configured: rows.some((row) => row.role === 'admin'),
    profiles: rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      color: row.color,
      avatarUrl: row.avatarUrl,
      enrolled: Boolean(row.userId),
      email: row.email ?? null,
      isAdmin: row.role === 'admin',
      role: normalizeAppRole(row.role),
    })),
  };
}

export async function enrollExistingProfiles(
  enrollments: Array<{ profileId: string; credentials: ProfileCredentialsInput }>,
): Promise<Array<{ profileId: string; recoveryCodes: string[] }>> {
  ensureDatabase();
  const db = getDatabase();
  const status = authenticationEnrollmentStatus();
  if (status.profiles.length === 0) throw new Error('Complete household setup first.');
  if (status.configured) throw new Error('Authentication enrollment is already complete.');
  const activeIds = new Set(status.profiles.map((profile) => profile.id));
  if (
    enrollments.length !== activeIds.size ||
    enrollments.some((entry) => !activeIds.has(entry.profileId)) ||
    new Set(enrollments.map((entry) => entry.profileId)).size !== activeIds.size
  ) {
    throw new Error('Every active household profile must be enrolled exactly once.');
  }
  const emails = enrollments.map((entry) => normalizeEmail(entry.credentials.email));
  if (new Set(emails).size !== emails.length) throw new Error('Each profile needs a unique email.');

  const prepared = await Promise.all(
    enrollments.map((entry, index) => {
      const profile = status.profiles.find((candidate) => candidate.id === entry.profileId)!;
      return prepareProfileEnrollment(
        profile.displayName,
        entry.credentials,
        index === 0 ? 'admin' : 'parent',
      );
    }),
  );

  const now = new Date();
  db.transaction((transaction) => {
    enrollments.forEach((entry, index) => {
      const enrollment = prepared[index]!;
      transaction.insert(user).values(enrollment.user).run();
      transaction.insert(account).values(enrollment.account).run();
      transaction
        .insert(profileAuthLinks)
        .values({
          profileId: entry.profileId,
          userId: enrollment.user.id,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      transaction
        .insert(profileSecurity)
        .values({ profileId: entry.profileId, ...enrollment.security })
        .run();
      transaction
        .insert(authRecoveryCodes)
        .values(
          enrollment.recoveryRows.map((row) => ({ ...row, userId: enrollment.user.id as string })),
        )
        .run();
    });
    transaction
      .insert(authSecurityEvents)
      .values({
        id: randomUUID(),
        userId: prepared[0]!.user.id,
        profileId: enrollments[0]!.profileId,
        event: 'bootstrap',
        details: JSON.stringify({ profileCount: enrollments.length, upgraded: true }),
        createdAt: now,
      })
      .run();
  });

  return enrollments.map((entry, index) => ({
    profileId: entry.profileId,
    recoveryCodes: prepared[index]!.recoveryCodes,
  }));
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [candidate, ...rest] = part.trim().split('=');
    if (candidate === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

async function sessionPrincipal(request: Request): Promise<RequestPrincipal | null> {
  const authSession = await auth.api.getSession({ headers: request.headers });
  if (!authSession) return null;
  const authUser = authSession.user as typeof authSession.user & {
    role?: string | null;
    banned?: boolean | null;
  };
  if (authUser.banned) return null;
  const link = getDatabase()
    .select({ profileId: profileAuthLinks.profileId, archivedAt: profiles.archivedAt })
    .from(profileAuthLinks)
    .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
    .where(eq(profileAuthLinks.userId, authSession.user.id))
    .get();
  if (!link || link.archivedAt) return null;
  const activeCookie = cookieValue(request, 'bord_active_profile');
  const requestedProfileId = parseSessionBoundProfileValue(activeCookie, authSession.session.id);
  const activeProfile = requestedProfileId
    ? getDatabase()
        .select({ id: profiles.id, role: user.role })
        .from(profiles)
        .innerJoin(profileAuthLinks, eq(profileAuthLinks.profileId, profiles.id))
        .innerJoin(user, eq(user.id, profileAuthLinks.userId))
        .innerJoin(profileSecurity, eq(profileSecurity.profileId, profiles.id))
        .where(and(eq(profiles.id, requestedProfileId), isNull(profiles.archivedAt)))
        .get()
    : null;
  const accountRole = normalizeAppRole(authUser.role);
  const activeProfileRole = normalizeAppRole(activeProfile?.role ?? accountRole);
  return {
    kind: 'session',
    userId: authSession.user.id,
    role: effectiveAppRole(accountRole, activeProfileRole),
    accountRole,
    activeProfileRole,
    sessionId: authSession.session.id,
    apiKeyId: null,
    linkedProfileId: link.profileId,
    profileId: activeProfile?.id ?? link.profileId,
  };
}

function bearerKey(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (!match) throw new RequestAuthError(401, 'invalid_authorization', 'Use a Bearer API key.');
  return match[1]!;
}

async function apiKeyPrincipal(
  request: Request,
  resource: ApiResource,
  action: ApiAction,
): Promise<RequestPrincipal | null> {
  const key = bearerKey(request);
  if (!key) return null;
  if (!key.startsWith('bord_sk_')) {
    throw new RequestAuthError(401, 'invalid_api_key', 'The API key is invalid.');
  }
  const result = await auth.api.verifyApiKey({
    body: { key },
  });
  if (!result.valid || !result.key) {
    const rateLimited = result.error?.code === 'RATE_LIMITED';
    throw new RequestAuthError(
      rateLimited ? 429 : 401,
      rateLimited ? 'api_key_rate_limited' : 'invalid_api_key',
      rateLimited ? 'The API key rate limit has been reached.' : 'The API key is invalid.',
      rateLimited ? 60 : undefined,
    );
  }
  const permissions = apiPermissionsSchema.safeParse(result.key.permissions);
  if (!permissions.success || !permissions.data[resource]?.includes(action)) {
    throw new RequestAuthError(
      403,
      'insufficient_api_key_permissions',
      `This API key needs ${resource}:${action} permission.`,
    );
  }
  const owner = getDatabase()
    .select({
      role: user.role,
      banned: user.banned,
      profileId: profileAuthLinks.profileId,
      archivedAt: profiles.archivedAt,
    })
    .from(user)
    .innerJoin(profileAuthLinks, eq(profileAuthLinks.userId, user.id))
    .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
    .where(eq(user.id, result.key.referenceId))
    .get();
  if (!owner || owner.role !== 'admin' || owner.banned || owner.archivedAt) {
    throw new RequestAuthError(
      403,
      'api_key_owner_forbidden',
      'The API key owner is not an admin.',
    );
  }
  auditApiKeyUse(result.key.id, result.key.referenceId, owner.profileId);
  return {
    kind: 'api-key',
    userId: result.key.referenceId,
    role: 'admin',
    accountRole: 'admin',
    activeProfileRole: 'admin',
    sessionId: null,
    apiKeyId: result.key.id,
    linkedProfileId: owner.profileId,
    profileId: owner.profileId,
    apiPermissions: permissions.data,
  };
}

export async function authenticateApiRequest(
  request: Request,
  resource: ApiResource,
  action: ApiAction,
): Promise<RequestPrincipal> {
  ensureDatabase();
  if (process.env.NODE_ENV === 'test' && !isAuthenticationConfigured()) {
    const profile = getDatabase()
      .select({ id: profiles.id })
      .from(profiles)
      .where(isNull(profiles.archivedAt))
      .limit(1)
      .get();
    if (profile) {
      return {
        kind: 'session',
        userId: 'test-auth-user',
        role: 'admin',
        accountRole: 'admin',
        activeProfileRole: 'admin',
        sessionId: 'test-auth-session',
        apiKeyId: null,
        linkedProfileId: profile.id,
        profileId: profile.id,
      };
    }
  }
  const keyPrincipal = await apiKeyPrincipal(request, resource, action);
  if (keyPrincipal) return keyPrincipal;
  const principal = await sessionPrincipal(request);
  if (!principal) {
    throw new RequestAuthError(401, 'authentication_required', 'Sign in or provide an API key.');
  }
  return principal;
}

export async function getAuthenticatedSessionPrincipal(
  request: Request,
): Promise<RequestPrincipal | null> {
  ensureDatabase();
  return sessionPrincipal(request);
}

export async function requireAdminSession(
  request: Request,
  options: { fresh?: boolean } = {},
): Promise<RequestPrincipal> {
  const principal = await sessionPrincipal(request);
  if (!principal) {
    throw new RequestAuthError(401, 'authentication_required', 'Sign in as the admin.');
  }
  if (principal.role !== 'admin' || principal.profileId !== principal.linkedProfileId) {
    throw new RequestAuthError(
      403,
      'admin_required',
      'Switch back to the admin profile and sign in as its account.',
    );
  }
  if (options.fresh !== false) {
    const row = getDatabase()
      .select({ createdAt: session.createdAt })
      .from(session)
      .where(eq(session.id, principal.sessionId!))
      .get();
    if (!row || Date.now() - row.createdAt.getTime() > 10 * 60 * 1_000) {
      throw new RequestAuthError(
        403,
        'fresh_admin_session_required',
        'Sign in again before changing API keys or security settings.',
      );
    }
  }
  return principal;
}

export async function verifyProfilePassword(input: {
  sessionId: string;
  userId: string;
  profileId: string;
  password: string;
  requestId?: string;
}): Promise<{ ok: true } | { ok: false; retryAfterSeconds?: number }> {
  ensureDatabase();
  const db = getDatabase();
  const now = new Date();
  // Keep the existing rate-limit table, but key by authenticated account so a
  // new session cannot reset the password guessing budget. Reserve before hashing.
  const bucket = `password:${input.userId}`;
  const reserved = db.transaction((tx) => {
    const attempt = tx
      .select()
      .from(profilePinAttempts)
      .where(
        and(
          eq(profilePinAttempts.sessionId, bucket),
          eq(profilePinAttempts.profileId, input.profileId),
        ),
      )
      .get();
    if (attempt?.lockedUntil && attempt.lockedUntil > now)
      return {
        blocked: true as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000),
        ),
      };
    const expired =
      !attempt || now.getTime() - attempt.windowStartedAt.getTime() >= PROFILE_PASSWORD_WINDOW_MS;
    const failedAttempts = expired ? 1 : attempt.failedAttempts + 1;
    const lockedUntil =
      failedAttempts >= PROFILE_PASSWORD_MAX_ATTEMPTS
        ? new Date(now.getTime() + PROFILE_PASSWORD_WINDOW_MS)
        : null;
    const id = attempt?.id ?? randomUUID();
    const values = {
      windowStartedAt: expired ? now : attempt.windowStartedAt,
      failedAttempts,
      lockedUntil,
      updatedAt: now,
    };
    if (attempt)
      tx.update(profilePinAttempts).set(values).where(eq(profilePinAttempts.id, id)).run();
    else
      tx.insert(profilePinAttempts)
        .values({ id, sessionId: bucket, profileId: input.profileId, ...values })
        .run();
    return { blocked: false as const, id, failedAttempts, lockedUntil };
  });
  if (reserved.blocked) return { ok: false, retryAfterSeconds: reserved.retryAfterSeconds };
  const credential = db
    .select({ password: account.password, userId: user.id })
    .from(profileAuthLinks)
    .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
    .innerJoin(user, eq(user.id, profileAuthLinks.userId))
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
    .where(
      and(
        eq(profileAuthLinks.profileId, input.profileId),
        isNull(profiles.archivedAt),
        eq(user.banned, false),
      ),
    )
    .get();
  const valid = credential?.password
    ? await verifyPassword({ hash: credential.password, password: input.password })
    : false;
  // Do not accept credentials changed, revoked or archived during hashing.
  const current = credential
    ? db
        .select({ password: account.password })
        .from(account)
        .innerJoin(user, eq(user.id, account.userId))
        .innerJoin(profileAuthLinks, eq(profileAuthLinks.userId, user.id))
        .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
        .where(
          and(
            eq(user.id, credential.userId),
            eq(account.providerId, 'credential'),
            eq(profileAuthLinks.profileId, input.profileId),
            isNull(profiles.archivedAt),
            eq(user.banned, false),
          ),
        )
        .get()
    : null;
  if (valid && current?.password === credential?.password) {
    db.delete(profilePinAttempts).where(eq(profilePinAttempts.id, reserved.id)).run();
    recordSecurityEvent({
      userId: input.userId,
      profileId: input.profileId,
      event: 'profile_switch',
      requestId: input.requestId,
    });
    return { ok: true };
  }
  recordSecurityEvent({
    userId: input.userId,
    profileId: input.profileId,
    event: 'profile_password_failed',
    requestId: input.requestId,
    details: { failedAttempts: reserved.failedAttempts, locked: Boolean(reserved.lockedUntil) },
  });
  return reserved.lockedUntil
    ? { ok: false, retryAfterSeconds: Math.ceil(PROFILE_PASSWORD_WINDOW_MS / 1000) }
    : { ok: false };
}

export async function recoverAccountWithCode(input: unknown): Promise<void> {
  ensureDatabase();
  const parsed = accountRecoverySchema.parse(input);
  const db = getDatabase();
  const authUser = db
    .select()
    .from(user)
    .where(eq(user.email, normalizeEmail(parsed.email)))
    .get();
  const codeHash = recoveryCodeHash(parsed.recoveryCode);
  const recovery = authUser
    ? db
        .select()
        .from(authRecoveryCodes)
        .where(
          and(
            eq(authRecoveryCodes.userId, authUser.id),
            eq(authRecoveryCodes.codeHash, codeHash),
            isNull(authRecoveryCodes.usedAt),
          ),
        )
        .get()
    : null;
  if (!authUser || !recovery || (recovery.expiresAt && recovery.expiresAt <= new Date())) {
    await hashPassword(parsed.newPassphrase);
    throw new RequestAuthError(401, 'invalid_recovery_code', 'The recovery code is invalid.');
  }
  const passwordHash = await hashPassword(parsed.newPassphrase);
  const now = new Date();
  db.transaction((transaction) => {
    transaction
      .update(account)
      .set({ password: passwordHash, updatedAt: now })
      .where(and(eq(account.userId, authUser.id), eq(account.providerId, 'credential')))
      .run();
    transaction
      .update(authRecoveryCodes)
      .set({ usedAt: now })
      .where(eq(authRecoveryCodes.id, recovery.id))
      .run();
    transaction.delete(session).where(eq(session.userId, authUser.id)).run();
    transaction
      .update(user)
      .set({ emailVerified: true, updatedAt: now })
      .where(eq(user.id, authUser.id))
      .run();
  });
  recordSecurityEvent({
    userId: authUser.id,
    event: 'recovery_code_used',
    details: { codePrefix: recovery.codePrefix },
  });
}

export async function verifyCurrentPassword(userId: string, passphrase: string): Promise<boolean> {
  const credential = getDatabase()
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .get();
  return credential?.password
    ? verifyPassword({ hash: credential.password, password: passphrase })
    : false;
}

export function recordSecurityEvent(input: {
  userId?: string | null;
  profileId?: string | null;
  apiKeyId?: string | null;
  event: typeof authSecurityEvents.$inferInsert.event;
  requestId?: string;
  details?: Record<string, unknown>;
}): void {
  ensureDatabase();
  getDatabase()
    .insert(authSecurityEvents)
    .values({
      id: randomUUID(),
      userId: input.userId ?? null,
      profileId: input.profileId ?? null,
      apiKeyId: input.apiKeyId ?? null,
      event: input.event,
      requestId: input.requestId ?? null,
      details: JSON.stringify(input.details ?? {}),
      createdAt: new Date(),
    })
    .run();
}

function auditApiKeyUse(apiKeyId: string, userId: string, profileId: string): void {
  const recent = getDatabase()
    .select({ createdAt: authSecurityEvents.createdAt })
    .from(authSecurityEvents)
    .where(
      and(
        eq(authSecurityEvents.apiKeyId, apiKeyId),
        eq(authSecurityEvents.event, 'api_key_used'),
        gt(authSecurityEvents.createdAt, new Date(Date.now() - 5 * 60 * 1_000)),
      ),
    )
    .orderBy(desc(authSecurityEvents.createdAt))
    .limit(1)
    .get();
  if (!recent) {
    recordSecurityEvent({ userId, profileId, apiKeyId, event: 'api_key_used' });
  }
}

export function invalidateAuthenticationAfterRestore(): void {
  ensureDatabase();
  const db = getDatabase();
  const now = new Date();
  db.transaction((transaction) => {
    transaction.delete(session).run();
    transaction.delete(verification).run();
    transaction.delete(passkey).run();
    transaction.delete(authRecoveryCodes).run();
    transaction
      .update(apikey)
      .set({ enabled: false, updatedAt: now })
      .where(eq(apikey.enabled, true))
      .run();
  });
  recordSecurityEvent({
    event: 'credentials_invalidated',
    details: { reason: 'database_restore' },
  });
}

export function requestFingerprint(request: Request): string {
  return createHash('sha256')
    .update(request.headers.get('user-agent') ?? '')
    .update('\0')
    .update(request.headers.get('x-forwarded-for') ?? '')
    .digest('base64url')
    .slice(0, 22);
}
