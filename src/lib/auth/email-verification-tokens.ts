import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { createEmailVerificationToken } from 'better-auth/api';
import { verifyJWT } from 'better-auth/crypto';
import { getDatabase } from '@/lib/db/client';
import { verification } from '@/lib/db/schema';

function identifier(token: string) {
  return `bord-email-verification:${createHash('sha256').update(token).digest('hex')}`;
}

/** Better Auth still signs/verifies JWTs. This ledger adds one-use revocation. */
export async function issueEmailVerification(token: string, secret: string) {
  const payload = await verifyJWT(token, secret);
  if (!payload || typeof payload.email !== 'string' || typeof payload.exp !== 'number')
    throw new Error('The authentication provider returned an invalid verification token.');
  const remaining = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
  // Its normal signer is deterministic within a second. A library-supported extra
  // claim keeps a newly requested link distinct from one revoked during restore.
  const issued = await createEmailVerificationToken(
    secret,
    payload.email,
    typeof payload.updateTo === 'string' ? payload.updateTo : undefined,
    remaining,
    {
      ...(typeof payload.requestType === 'string' ? { requestType: payload.requestType } : {}),
      bordIssuance: randomUUID(),
    },
  );
  const now = new Date();
  getDatabase()
    .insert(verification)
    .values({
      id: randomUUID(),
      identifier: identifier(issued),
      value: 'email-verification',
      expiresAt: new Date(payload.exp * 1000),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return issued;
}

/** Atomically consumes a live issuance before the library verifies/uses the JWT. */
export function consumeEmailVerification(token: string) {
  return (
    getDatabase()
      .delete(verification)
      .where(
        and(eq(verification.identifier, identifier(token)), gt(verification.expiresAt, new Date())),
      )
      .run().changes === 1
  );
}
