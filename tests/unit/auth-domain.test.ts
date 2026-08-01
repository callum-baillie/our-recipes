import { describe, expect, it } from 'vitest';

import {
  apiPermissionsSchema,
  idempotencyKeySchema,
  normalizedEmailSchema,
  passphraseSchema,
  profilePinSchema,
} from '@/lib/domain/auth';

describe('authentication domain contracts', () => {
  it('normalizes email addresses and requires strong passphrases', () => {
    expect(normalizedEmailSchema.parse('  Cook@Example.COM  ')).toBe('cook@example.com');
    expect(passphraseSchema.safeParse('too short').success).toBe(false);
    expect(passphraseSchema.safeParse('a household passphrase').success).toBe(true);
  });

  it('requires an exact non-trivial six-digit profile PIN', () => {
    expect(profilePinSchema.safeParse('123456').success).toBe(false);
    expect(profilePinSchema.safeParse('111111').success).toBe(false);
    expect(profilePinSchema.safeParse('739204').success).toBe(true);
  });

  it('deduplicates scoped API permissions and rejects unknown resources', () => {
    expect(
      apiPermissionsSchema.parse({
        recipes: ['update', 'read', 'read'],
        pantry: ['delete'],
      }),
    ).toEqual({
      recipes: ['read', 'update'],
      pantry: ['delete'],
    });
    expect(apiPermissionsSchema.safeParse({ backups: ['read'] }).success).toBe(false);
  });

  it('accepts bounded visible idempotency keys only', () => {
    expect(idempotencyKeySchema.safeParse('recipe-import-42').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('contains a space').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});
