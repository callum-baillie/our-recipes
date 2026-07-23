import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  NUTRITION_ACCESS_COOKIE,
  createNutritionSessionValue,
  hashNutritionAccessSecret,
  parseNutritionSessionValue,
  verifyNutritionAccessSecret,
} from '@/lib/nutrition-access';

const SIGNING_SECRET = 'a-test-signing-secret-that-is-at-least-thirty-two-bytes';
const PRINCIPAL_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('Nutrition access credential hashing', () => {
  beforeAll(() => {
    expect(NUTRITION_ACCESS_COOKIE).toBe('bord_nutrition_access');
  });

  it('creates a versioned salted scrypt verifier and validates the matching secret', () => {
    const serialized = hashNutritionAccessSecret(
      'correct horse battery staple',
      Buffer.alloc(16, 7),
    );
    expect(serialized).toMatch(/^scrypt\$1\$16384,8,1\$/u);
    expect(verifyNutritionAccessSecret('correct horse battery staple', serialized)).toBe(true);
    expect(verifyNutritionAccessSecret('incorrect secret', serialized)).toBe(false);
  });

  it('uses a random salt for production calls', () => {
    const first = hashNutritionAccessSecret('same sufficiently long secret');
    const second = hashNutritionAccessSecret('same sufficiently long secret');
    expect(first).not.toBe(second);
    expect(verifyNutritionAccessSecret('same sufficiently long secret', first)).toBe(true);
    expect(verifyNutritionAccessSecret('same sufficiently long secret', second)).toBe(true);
  });

  it.each([
    '',
    'plain-text',
    'scrypt$2$16384,8,1$abc$def',
    'scrypt$1$999999,8,1$abc$def',
    'scrypt$1$16384,8,1$not*base64$key',
  ])('rejects malformed or unsupported verifier %s', (serialized) => {
    expect(verifyNutritionAccessSecret('sufficient secret', serialized)).toBe(false);
  });

  it('rejects secrets that are too short or unreasonably large', () => {
    expect(() => hashNutritionAccessSecret('short')).toThrow(/at least 8/u);
    expect(() => hashNutritionAccessSecret('x'.repeat(300))).toThrow(/UTF-8 bytes/u);
    expect(verifyNutritionAccessSecret('short', 'anything')).toBe(false);
  });

  it('requires an exact-size salt when deterministic salt is supplied', () => {
    expect(() => hashNutritionAccessSecret('sufficient secret', Buffer.alloc(8))).toThrow(
      /16 bytes/u,
    );
  });
});

describe('Nutrition session values', () => {
  const claims = {
    principalId: PRINCIPAL_ID,
    accessVersion: 3,
    issuedAt: 1_000,
    expiresAt: 2_000,
  };

  it('round-trips signed scoped claims without including a credential', () => {
    const value = createNutritionSessionValue(claims, SIGNING_SECRET);
    expect(value).not.toContain('secret');
    expect(parseNutritionSessionValue(value, SIGNING_SECRET, { nowSeconds: 1_500 })).toEqual(
      claims,
    );
  });

  it('rejects tampered payloads and signatures', () => {
    const value = createNutritionSessionValue(claims, SIGNING_SECRET);
    const [payload, signature] = value.split('.');
    expect(
      parseNutritionSessionValue(`${payload}x.${signature}`, SIGNING_SECRET, { nowSeconds: 1_500 }),
    ).toBeNull();
    expect(
      parseNutritionSessionValue(`${payload}.${signature}x`, SIGNING_SECRET, { nowSeconds: 1_500 }),
    ).toBeNull();
    expect(
      parseNutritionSessionValue(value, `${SIGNING_SECRET}-different`, { nowSeconds: 1_500 }),
    ).toBeNull();
  });

  it('rejects expired and implausibly future sessions', () => {
    const value = createNutritionSessionValue(claims, SIGNING_SECRET);
    expect(parseNutritionSessionValue(value, SIGNING_SECRET, { nowSeconds: 2_000 })).toBeNull();
    expect(
      parseNutritionSessionValue(value, SIGNING_SECRET, { nowSeconds: 100, clockSkewSeconds: 10 }),
    ).toBeNull();
  });

  it('rejects invalid IDs, versions, timestamps, and excessive lifetimes before signing', () => {
    expect(() =>
      createNutritionSessionValue({ ...claims, principalId: 'profile-1' }, SIGNING_SECRET),
    ).toThrow(/UUID/u);
    expect(() =>
      createNutritionSessionValue({ ...claims, accessVersion: 0 }, SIGNING_SECRET),
    ).toThrow(/positive integer/u);
    expect(() =>
      createNutritionSessionValue({ ...claims, issuedAt: 2_000 }, SIGNING_SECRET),
    ).toThrow(/lifetime/u);
    expect(() =>
      createNutritionSessionValue({ ...claims, expiresAt: 5_000 }, SIGNING_SECRET, {
        maxLifetimeSeconds: 500,
      }),
    ).toThrow(/lifetime/u);
  });

  it('requires a strong signing secret and safely rejects absent or malformed values', () => {
    expect(() => createNutritionSessionValue(claims, 'too short')).toThrow(/at least 32/u);
    expect(() => parseNutritionSessionValue(undefined, 'too short')).toThrow(/at least 32/u);
    expect(parseNutritionSessionValue(undefined, SIGNING_SECRET)).toBeNull();
    expect(parseNutritionSessionValue('not-a-session', SIGNING_SECRET)).toBeNull();
  });
});
