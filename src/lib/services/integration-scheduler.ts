import 'server-only';
import { and, asc, gt, isNull, lte, or } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { integrationAccounts } from '@/lib/db/schema';
import { adoptLegacyScaleConnections, syncIntegration } from './integration-service';

type Scheduler = typeof globalThis & {
  __bordIntegrationTimer?: NodeJS.Timeout;
  __bordIntegrationBusy?: boolean;
};
export function ensureIntegrationScheduler() {
  if (process.env.NODE_ENV === 'test' || process.env.NEXT_PHASE === 'phase-production-build')
    return;
  const state = globalThis as Scheduler;
  if (state.__bordIntegrationTimer) return;
  const tick = async () => {
    if (state.__bordIntegrationBusy) return;
    state.__bordIntegrationBusy = true;
    try {
      ensureDatabase();
      adoptLegacyScaleConnections();
      const due = getDatabase()
        .select({ id: integrationAccounts.id })
        .from(integrationAccounts)
        .where(
          and(
            gt(integrationAccounts.syncIntervalMinutes, 0),
            lte(integrationAccounts.nextSyncAt, new Date()),
            or(
              isNull(integrationAccounts.leaseUntil),
              lte(integrationAccounts.leaseUntil, new Date()),
            ),
          ),
        )
        .orderBy(asc(integrationAccounts.nextSyncAt))
        .limit(10)
        .all();
      for (const { id } of due) await syncIntegration(id).catch(() => undefined);
    } catch {
      /* Retry on the next tick; no provider secrets in application logs. */
    } finally {
      state.__bordIntegrationBusy = false;
    }
  };
  state.__bordIntegrationTimer = setInterval(() => void tick(), 60_000);
  state.__bordIntegrationTimer.unref();
  void tick();
}
