import 'server-only';

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const NUTRITION_ACCESS_COOKIE = 'bord_nutrition_access';
export const LEGACY_NUTRITION_ACCESS_COOKIE = 'our_recipes_nutrition_access';

const HASH_VERSION = '1';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const MIN_SECRET_LENGTH = 8;
const MAX_SECRET_BYTES = 256;
const SESSION_AUDIENCE = 'bord:nutrition';
const LEGACY_SESSION_AUDIENCE = 'our-recipes:nutrition';
const DEFAULT_MAX_SESSION_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_CLOCK_SKEW_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type NutritionSessionClaims = {
  principalId: string;
  accessVersion: number;
  issuedAt: number;
  expiresAt: number;
};

type SerializedNutritionSession = NutritionSessionClaims & {
  audience: typeof SESSION_AUDIENCE;
};

function validateAccessSecret(secret: string): void {
  const bytes = Buffer.byteLength(secret, 'utf8');
  if (secret.length < MIN_SECRET_LENGTH || bytes > MAX_SECRET_BYTES) {
    throw new Error(
      `Nutrition access secret must be at least ${MIN_SECRET_LENGTH} characters and no more than ${MAX_SECRET_BYTES} UTF-8 bytes.`,
    );
  }
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, DERIVED_KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Creates a versioned, salted, memory-hard verifier. The optional salt exists
 * only to make deterministic unit tests possible; production callers omit it.
 */
export function hashNutritionAccessSecret(secret: string, salt = randomBytes(SALT_BYTES)): string {
  validateAccessSecret(secret);
  if (salt.length !== SALT_BYTES)
    throw new Error(`Nutrition access salt must be ${SALT_BYTES} bytes.`);
  const key = deriveKey(secret, Buffer.from(salt));
  return [
    'scrypt',
    HASH_VERSION,
    `${SCRYPT_N},${SCRYPT_R},${SCRYPT_P}`,
    Buffer.from(salt).toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export function verifyNutritionAccessSecret(secret: string, serialized: string): boolean {
  try {
    validateAccessSecret(secret);
    const [algorithm, version, parameters, saltValue, keyValue, extra] = serialized.split('$');
    if (
      extra !== undefined ||
      algorithm !== 'scrypt' ||
      version !== HASH_VERSION ||
      parameters !== `${SCRYPT_N},${SCRYPT_R},${SCRYPT_P}` ||
      !saltValue ||
      !keyValue
    ) {
      return false;
    }
    const salt = decodeBase64Url(saltValue);
    const expected = decodeBase64Url(keyValue);
    if (salt?.length !== SALT_BYTES || expected?.length !== DERIVED_KEY_BYTES) return false;
    const actual = deriveKey(secret, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function validateSigningSecret(signingSecret: string): void {
  if (Buffer.byteLength(signingSecret, 'utf8') < 32) {
    throw new Error('Nutrition session signing secret must be at least 32 UTF-8 bytes.');
  }
}

function sessionSignature(payload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(payload, 'utf8').digest('base64url');
}

function validateSessionClaims(
  claims: NutritionSessionClaims,
  options: { maxLifetimeSeconds: number },
): void {
  if (!UUID_PATTERN.test(claims.principalId)) {
    throw new Error('Nutrition principal ID must be a UUID.');
  }
  if (!Number.isSafeInteger(claims.accessVersion) || claims.accessVersion < 1) {
    throw new Error('Nutrition access version must be a positive integer.');
  }
  if (!Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt)) {
    throw new Error('Nutrition session timestamps must be integer seconds.');
  }
  const lifetime = claims.expiresAt - claims.issuedAt;
  if (lifetime <= 0 || lifetime > options.maxLifetimeSeconds) {
    throw new Error('Nutrition session lifetime is invalid.');
  }
}

export function createNutritionSessionValue(
  claims: NutritionSessionClaims,
  signingSecret: string,
  options: { maxLifetimeSeconds?: number } = {},
): string {
  validateSigningSecret(signingSecret);
  const maxLifetimeSeconds = options.maxLifetimeSeconds ?? DEFAULT_MAX_SESSION_SECONDS;
  if (!Number.isSafeInteger(maxLifetimeSeconds) || maxLifetimeSeconds <= 0) {
    throw new Error('Maximum Nutrition session lifetime must be a positive integer.');
  }
  validateSessionClaims(claims, { maxLifetimeSeconds });
  const payload = Buffer.from(
    JSON.stringify({ ...claims, audience: SESSION_AUDIENCE } satisfies SerializedNutritionSession),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sessionSignature(payload, signingSecret)}`;
}

export function parseNutritionSessionValue(
  value: string | undefined,
  signingSecret: string,
  options: {
    nowSeconds?: number;
    maxLifetimeSeconds?: number;
    clockSkewSeconds?: number;
  } = {},
): NutritionSessionClaims | null {
  validateSigningSecret(signingSecret);
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const signatureValue = value.slice(separator + 1);
  const suppliedSignature = decodeBase64Url(signatureValue);
  const expectedSignature = Buffer.from(sessionSignature(payload, signingSecret), 'base64url');
  if (
    suppliedSignature?.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }
  const payloadBytes = decodeBase64Url(payload);
  if (!payloadBytes || payloadBytes.length > 2_048) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  if (
    (record.audience !== SESSION_AUDIENCE && record.audience !== LEGACY_SESSION_AUDIENCE) ||
    typeof record.principalId !== 'string' ||
    typeof record.accessVersion !== 'number' ||
    typeof record.issuedAt !== 'number' ||
    typeof record.expiresAt !== 'number'
  ) {
    return null;
  }
  const claims: NutritionSessionClaims = {
    principalId: record.principalId,
    accessVersion: record.accessVersion,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  };
  const maxLifetimeSeconds = options.maxLifetimeSeconds ?? DEFAULT_MAX_SESSION_SECONDS;
  try {
    validateSessionClaims(claims, { maxLifetimeSeconds });
  } catch {
    return null;
  }
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const clockSkewSeconds = options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  if (
    !Number.isSafeInteger(nowSeconds) ||
    !Number.isSafeInteger(clockSkewSeconds) ||
    clockSkewSeconds < 0 ||
    claims.issuedAt > nowSeconds + clockSkewSeconds ||
    claims.expiresAt <= nowSeconds
  ) {
    return null;
  }
  return claims;
}
