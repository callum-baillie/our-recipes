import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiDecisionFeedback, aiDecisionRecords } from '@/lib/db/schema';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import { DecisionError } from '@/lib/providers/decisions-provider';

export function decisionHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
const scope = (p: RequestPrincipal) =>
  and(eq(aiDecisionRecords.ownerUserId, p.userId), eq(aiDecisionRecords.profileId, p.profileId));
export function findDecision(p: RequestPrincipal, task: string, subject: string, hash: string) {
  ensureDatabase();
  const subjectScope = and(
    scope(p),
    eq(aiDecisionRecords.task, task),
    eq(aiDecisionRecords.subjectKey, subject),
  );
  const corrected = getDatabase()
    .select()
    .from(aiDecisionRecords)
    .where(and(subjectScope, isNotNull(aiDecisionRecords.correctionJson)))
    .orderBy(desc(aiDecisionRecords.createdAt))
    .limit(1)
    .get();
  return (
    corrected ??
    getDatabase()
      .select()
      .from(aiDecisionRecords)
      .where(
        and(
          subjectScope,
          eq(aiDecisionRecords.contextHash, hash),
          gt(aiDecisionRecords.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(aiDecisionRecords.createdAt))
      .limit(1)
      .get() ??
    null
  );
}
export function ownedDecision(p: RequestPrincipal, id: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(aiDecisionRecords)
    .where(and(scope(p), eq(aiDecisionRecords.id, id)))
    .get();
  if (!row) throw new DecisionError('Suggestion not found for this account and profile.', 404);
  return row;
}
export function storeDecision(
  p: RequestPrincipal,
  input: {
    task: string;
    subject: string;
    hash: string;
    evidence: unknown;
    result: unknown;
    ttlMs?: number;
  },
) {
  ensureDatabase();
  const row = {
    id: randomUUID(),
    ownerUserId: p.userId,
    profileId: p.profileId,
    task: input.task,
    subjectKey: input.subject,
    contextHash: input.hash,
    evidenceJson: JSON.stringify(input.evidence),
    resultJson: JSON.stringify(input.result),
    correctionJson: null,
    version: 1,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + (input.ttlMs ?? 86_400_000)),
  };
  getDatabase().insert(aiDecisionRecords).values(row).run();
  return row;
}
export function saveDecisionCorrection(
  p: RequestPrincipal,
  id: string,
  version: number,
  action: string,
  value: unknown,
) {
  const row = ownedDecision(p, id);
  if (row.version !== version)
    throw new DecisionError('This suggestion changed in another tab. Refresh it first.', 409);
  getDatabase().transaction((tx) => {
    // Reset all retained overrides for this subject, so an older correction cannot reappear.
    if (action === 'reset')
      tx.update(aiDecisionRecords)
        .set({ correctionJson: null, expiresAt: new Date(0) })
        .where(
          and(
            scope(p),
            eq(aiDecisionRecords.task, row.task),
            eq(aiDecisionRecords.subjectKey, row.subjectKey),
          ),
        )
        .run();
    const changed = tx
      .update(aiDecisionRecords)
      .set({
        correctionJson: action === 'reset' ? null : JSON.stringify(value),
        version: version + 1,
      })
      .where(and(scope(p), eq(aiDecisionRecords.id, id), eq(aiDecisionRecords.version, version)))
      .run();
    if (changed.changes !== 1)
      throw new DecisionError('This suggestion changed in another tab.', 409);
    tx.insert(aiDecisionFeedback)
      .values({
        id: randomUUID(),
        decisionId: id,
        ownerUserId: p.userId,
        action,
        valueJson: JSON.stringify(value),
        createdAt: new Date(),
      })
      .run();
  });
}
export function enforceDecisionBudget(p: RequestPrincipal) {
  const recent = getDatabase()
    .select({ id: aiDecisionRecords.id })
    .from(aiDecisionRecords)
    .where(
      and(
        eq(aiDecisionRecords.ownerUserId, p.userId),
        gt(aiDecisionRecords.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    )
    .limit(200)
    .all();
  if (recent.length >= 200)
    throw new DecisionError(
      'The hourly suggestion limit has been reached. Cached suggestions remain available.',
      429,
    );
}
const running = new Map<string, Promise<unknown>>();
export async function singleDecisionRun<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = running.get(key);
  if (existing) return existing as Promise<T>;
  if (running.size >= 4)
    throw new DecisionError('Other suggestions are being prepared. Please try again shortly.', 429);
  const pending = operation();
  running.set(key, pending);
  try {
    return await pending;
  } finally {
    running.delete(key);
  }
}
