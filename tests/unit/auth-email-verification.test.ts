import { afterEach, beforeEach, expect, it } from 'vitest';
import { createEmailVerificationToken } from 'better-auth/api';
import { verifyJWT } from 'better-auth/crypto';
import { ensureDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  issueEmailVerification,
  consumeEmailVerification,
} from '@/lib/auth/email-verification-tokens';
beforeEach(() => {
  resetDatabaseForTests();
  ensureDatabase();
});
afterEach(() => resetDatabaseForTests());
it('uses distinct library-signed issuances even when given the same input token', async () => {
  const secret = 'synthetic-verification-secret-at-least-thirty-two';
  const token = await createEmailVerificationToken(secret, 'fixture@example.test');
  const first = await issueEmailVerification(token, secret);
  const second = await issueEmailVerification(token, secret);
  expect(first).not.toBe(second);
  expect(await verifyJWT(first, secret)).toMatchObject({
    email: 'fixture@example.test',
    bordIssuance: expect.any(String),
  });
  expect(consumeEmailVerification(first)).toBe(true);
  expect(consumeEmailVerification(first)).toBe(false);
  expect(consumeEmailVerification(`${second}invalid`)).toBe(false);
  expect(consumeEmailVerification(second)).toBe(true);
  await expect(issueEmailVerification('forged-token', secret)).rejects.toThrow(
    /invalid verification token/,
  );
});
