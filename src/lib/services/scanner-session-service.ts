import 'server-only';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { pantryBatches, pantryProducts, scannerOperations } from '@/lib/db/schema';
import { ScannerError } from '@/lib/domain/scanner';
import type { ScanSessionEntry } from '@/lib/domain/scanner-session';
import type { RequestPrincipal } from './auth-service';
import { listPantryLocations } from './pantry-service';
import {
  boundedRows,
  ownedStation,
  scannerInstanceId,
  scannerStationList,
} from './scanner-station-service';

const DEFAULT_WINDOW_MS = 12 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const KINDS: Record<string, ScanSessionEntry['kind']> = {
  pantry_add: 'added',
  pantry_catalog_add: 'added',
  shopping_intake: 'added',
  leftover: 'added',
  pantry_remove: 'removed',
  recipe: 'cooked',
  batch_action: 'adjusted',
  stocktake: 'adjusted',
};

/**
 * A read-only view of what one station has recorded recently, newest first, with the live state
 * of any pantry batch a scan created. Scanning never depends on this view; it only reports.
 */
export function scannerSession(p: RequestPrincipal, id: string, since?: number) {
  if (p.kind !== 'session')
    throw new ScannerError('scanner_session_required', 'Sign in to view the scan list.', 403);
  const owned = ownedStation(p, id);
  const now = Date.now();
  const from = Math.max(
    now - MAX_WINDOW_MS,
    Number.isFinite(since) ? Number(since) : now - DEFAULT_WINDOW_MS,
  );
  const db = getDatabase();
  const rows = db
    .select()
    .from(scannerOperations)
    .where(
      and(eq(scannerOperations.stationId, id), gte(scannerOperations.createdAt, new Date(from))),
    )
    .orderBy(desc(scannerOperations.createdAt))
    .limit(150)
    .all()
    .filter((row) => row.result.type !== 'undo');
  const batchIds = [
    ...new Set(rows.flatMap((row) => (row.result.batchId ? [row.result.batchId] : []))),
  ];
  const locations = new Map(listPantryLocations().map((location) => [location.id, location.path]));
  const batches = new Map(
    (batchIds.length
      ? db
          .select({
            id: pantryBatches.id,
            version: pantryBatches.version,
            quantity: pantryBatches.quantityRemaining,
            unit: pantryBatches.unit,
            locationId: pantryBatches.locationId,
            status: pantryBatches.status,
            name: pantryProducts.displayName,
          })
          .from(pantryBatches)
          .innerJoin(pantryProducts, eq(pantryProducts.id, pantryBatches.productId))
          .where(inArray(pantryBatches.id, batchIds))
          .all()
      : []
    ).map((batch) => [batch.id, batch]),
  );
  const entries: ScanSessionEntry[] = rows.map((row) => {
    const result = row.result;
    const batch = result.batchId ? batches.get(result.batchId) : undefined;
    const command = (row.command ?? {}) as { command?: { barcode?: unknown } };
    const barcode = typeof command.command?.barcode === 'string' ? command.command.barcode : null;
    const review = row.outcome === 'needs_review';
    return {
      id: row.id,
      time: row.createdAt.toISOString(),
      kind: KINDS[result.type] ?? 'other',
      state: review ? 'review' : row.undoneBy ? 'undone' : 'saved',
      title: review ? 'Needs review' : (result.productName ?? batch?.name ?? result.message),
      detail: result.message,
      barcode,
      quantity: result.quantity ?? null,
      unit: result.unit ?? '',
      edited: !!batch && result.batchVersion !== undefined && batch.version !== result.batchVersion,
      canUndo: !review && !row.undoneBy && result.undoable !== false,
      batch: batch
        ? {
            id: batch.id,
            version: batch.version,
            quantity: batch.quantity,
            unit: batch.unit,
            location: locations.get(batch.locationId) ?? '',
            status: batch.status,
          }
        : null,
    };
  });
  const station = scannerStationList(p).find((s) => s.id === id);
  return {
    stationId: id,
    name: station?.name ?? id,
    stale: station?.stale ?? true,
    readerConnected: station?.state?.readerConnected ?? false,
    mode: station?.state?.mode ?? 'idle',
    bindingId: owned.bindingId,
    instanceId: scannerInstanceId(),
    serverTime: now,
    since: from,
    entries: boundedRows(entries, 60000),
  };
}
