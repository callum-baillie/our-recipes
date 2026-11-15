import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiDecisionRecords } from '@/lib/db/schema';
import { DECISION_TASKS } from '@/lib/domain/decision-assistance';
import type { RequestPrincipal } from './auth-service';
export function predictionHistory(p: RequestPrincipal, offset: number) {
  ensureDatabase();
  const rows = getDatabase()
    .select()
    .from(aiDecisionRecords)
    .where(
      and(
        eq(aiDecisionRecords.ownerUserId, p.userId),
        eq(aiDecisionRecords.profileId, p.profileId),
        inArray(aiDecisionRecords.task, Object.keys(DECISION_TASKS)),
      ),
    )
    .orderBy(desc(aiDecisionRecords.createdAt), desc(aiDecisionRecords.id))
    .limit(21)
    .offset(offset)
    .all();
  return {
    nextOffset: rows.length > 20 ? offset + 20 : null,
    records: rows.slice(0, 20).map((row) => ({
      id: row.id,
      task: row.task,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      result: JSON.parse(row.resultJson),
      evidence: JSON.parse(row.evidenceJson),
      correction: row.correctionJson ? JSON.parse(row.correctionJson) : null,
    })),
  };
}
