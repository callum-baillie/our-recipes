'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionItem } from '@/components/scan-session-cards';
import { useToast } from '@/components/toast-provider';
import { createClientUuid } from './client-uuid';
import { removeBatch, undoBatch } from './pantry-batch';
import { latestScanTime, markScansReviewed, readScansReviewed } from './scanner-activity';
import {
  INACTIVE_BATCH_STATUSES,
  type ScanSession,
  type ScanSessionEntry,
} from '@/lib/domain/scanner-session';

type Motion = 'in' | 'void' | 'bump';
type Seen = Map<string, { removed: boolean; amount: string }>;

const POLL_MS = 1500;
const MOTION_MS = 1700;
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

async function send(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.error?.message ?? 'Bòrd could not complete this change.');
  return result;
}

const gone = (entry: ScanSessionEntry) =>
  !!entry.batch && INACTIVE_BATCH_STATUSES.includes(entry.batch.status);

/** What the list shows for one scan right now. */
function view(entry: ScanSessionEntry) {
  const removed = entry.state === 'undone' || gone(entry);
  const batch = entry.batch && !gone(entry) ? entry.batch : null;
  const amount = batch
    ? batch.quantity === null
      ? 'Approximate'
      : `${number.format(batch.quantity)} ${batch.unit}`
    : entry.quantity !== null
      ? `${number.format(entry.quantity)} ${entry.unit}`.trim()
      : '';
  return { removed, batch, amount };
}

/** A scan the scanner could not turn into stock because no catalogue knows the barcode. */
const isUnnamed = (entry: ScanSessionEntry) =>
  entry.state === 'review' && !entry.resolved && !!entry.barcode && !entry.recipeHref;

/** Live scans from a registered hardware station, polled while the page is visible. */
export function useHandheldSession({
  accountId,
  stations,
  active = true,
  onStockChanged,
}: {
  accountId: string;
  stations: Array<{ id: string; name: string }>;
  /** Poll only while the list is on screen; other methods leave scans unreviewed. */
  active?: boolean;
  onStockChanged?: (() => void) | undefined;
}) {
  const { showToast } = useToast();
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [session, setSession] = useState<ScanSession | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [armed, setArmed] = useState(false);
  const [motion, setMotion] = useState<Record<string, Motion>>({});
  const [busy, setBusy] = useState('');
  const seen = useRef<Seen | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const request = useRef<AbortController | null>(null);
  const enabled = stations.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem('bord-scan-list-station');
        if (saved && stations.some((s) => s.id === saved)) setStationId(saved);
      } catch {
        /* Storage is optional. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [stations]);
  useEffect(() => {
    if (!stationId) return;
    const timer = setTimeout(() => {
      let saved = 0;
      try {
        localStorage.setItem('bord-scan-list-station', stationId);
        saved = Number(localStorage.getItem(`bord-scan-list-since:${stationId}`));
      } catch {
        /* Storage is optional. */
      }
      setSince(Number.isFinite(saved) && saved > 0 ? saved : null);
      seen.current = null;
      setArmed(false);
      setSession(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [stationId]);
  useEffect(() => {
    const running = timers.current;
    return () => running.forEach((timer) => clearTimeout(timer));
  }, []);

  const refresh = useCallback(async () => {
    if (!stationId || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const query = since ? `?since=${since}` : '';
      const response = await fetch(`/api/v1/scanner/stations/${stationId}/session${query}`, {
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        redirect: 'error',
      });
      const next = (await response.json()) as ScanSession & { error?: { message?: string } };
      if (!response.ok) throw new Error(next.error?.message ?? 'The scan list is unavailable.');
      if (controller.signal.aborted || request.current !== controller) return;

      const current: Seen = new Map(
        next.entries.map((entry) => {
          const { removed, amount } = view(entry);
          return [entry.id, { removed, amount }];
        }),
      );
      if (seen.current) {
        const changes: Record<string, Motion> = {};
        const spoken: string[] = [];
        for (const entry of next.entries) {
          const before = seen.current.get(entry.id);
          const now = current.get(entry.id)!;
          if (!before) {
            changes[entry.id] = now.removed ? 'void' : 'in';
            spoken.push(now.removed ? `${entry.title} removed` : `Scanned ${entry.title}`);
          } else if (!before.removed && now.removed) {
            changes[entry.id] = 'void';
            spoken.push(`${entry.title} removed`);
          } else if (!now.removed && before.amount !== now.amount) {
            changes[entry.id] = 'bump';
            spoken.push(`${entry.title} now ${now.amount}`);
          }
        }
        const ids = Object.keys(changes);
        if (ids.length) {
          setMotion((existing) => ({ ...existing, ...changes }));
          setAnnouncement(spoken.join('. '));
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            setMotion((existing) => {
              const rest = { ...existing };
              for (const id of ids) if (rest[id] === changes[id]) delete rest[id];
              return rest;
            });
          }, MOTION_MS);
          timers.current.add(timer);
        }
      }
      seen.current = current;
      setArmed(true);
      setSession(next);
      setOnline(true);
      // Looking at the list is what reviewing it means; the reminder toast stands down.
      const latest = latestScanTime(next);
      if (active && latest > readScansReviewed(accountId, stationId))
        markScansReviewed(accountId, stationId, latest);
    } catch {
      if (controller.signal.aborted || request.current !== controller) return;
      setOnline(false);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [accountId, active, stationId, since]);
  useEffect(() => {
    if (!enabled || !active) return;
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const wake = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      request.current?.abort();
      request.current = null;
    };
  }, [active, enabled, refresh]);

  const entries = (session?.entries ?? []).filter((entry) => !entry.resolved);
  const entryById = (key: string) => entries.find((entry) => `handheld:${entry.id}` === key);

  /** Run one change, then show the result straight away instead of waiting for the next poll. */
  async function change(entryId: string, work: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(entryId);
    try {
      await work();
      onStockChanged?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : failure, 'error');
    } finally {
      setBusy('');
      void refresh();
    }
  }

  function remove(key: string) {
    const entry = entryById(key);
    if (!entry || !session) return;
    const batch = entry.batch;
    void change(
      key,
      async () => {
        if (entry.canUndo && !entry.edited) {
          const result = await send('/api/v1/scanner/operations', {
            contractVersion: 2,
            operationId: createClientUuid(),
            stationId: session.stationId,
            instanceId: session.instanceId,
            bindingId: session.bindingId,
            command: { type: 'undo', targetOperationId: entry.id },
          });
          if (result?.outcome !== 'succeeded')
            throw new Error(result?.message ?? 'This scan could not be removed.');
          showToast(`Removed ${entry.title}.`, 'success');
        } else if (batch && !gone(entry)) {
          const removed = await removeBatch(batch);
          const close = showToast(`Removed ${entry.title}.`, 'success', {
            autoDismissMs: 8000,
            actions: [
              {
                label: 'Undo',
                onClick: async () => {
                  close();
                  try {
                    await undoBatch({
                      id: batch.id,
                      version: removed.batch?.version ?? batch.version + 1,
                    });
                    showToast(`Put ${entry.title} back.`, 'success');
                    onStockChanged?.();
                    void refresh();
                  } catch (error) {
                    showToast(
                      error instanceof Error ? error.message : 'That could not be undone.',
                      'error',
                    );
                  }
                },
              },
            ],
          });
        } else throw new Error('This scan can no longer be removed here.');
      },
      'This scan could not be removed.',
    );
  }

  const items: SessionItem[] = entries
    .filter((entry) => !isUnnamed(entry) && entry.state !== 'review')
    .map((entry) => {
      const { removed, batch, amount } = view(entry);
      return {
        key: `handheld:${entry.id}`,
        source: 'handheld',
        title: entry.title,
        brand: entry.brand,
        gtin: entry.gtin,
        time: entry.time,
        batch: batch
          ? {
              id: batch.id,
              version: batch.version,
              quantity: batch.quantity,
              unit: batch.unit,
              locationId: '',
              location: batch.location,
              bestBefore: batch.bestBefore,
            }
          : null,
        removed,
        amountLabel: amount,
        motion: armed ? motion[entry.id] : undefined,
        canPutBack: entry.canUndo && entry.kind === 'removed',
      };
    });
  const unnamed = [
    ...entries.filter(isUnnamed).reduce((groups, entry) => {
      groups.set(entry.barcode!, (groups.get(entry.barcode!) ?? 0) + 1);
      return groups;
    }, new Map<string, number>()),
  ].map(([barcode, count]) => ({ barcode, count }));
  const meals = entries.filter((entry) => entry.state === 'review' && entry.recipeHref);

  const offline = !online || !session || session.stale || !session.readerConnected;
  const state = !online
    ? 'Reconnecting…'
    : !session
      ? 'Connecting…'
      : session.stale
        ? 'Offline'
        : session.readerConnected
          ? 'Ready to scan'
          : 'No scanner plugged in';

  const startNew = () => {
    if (!session) return;
    try {
      localStorage.setItem(`bord-scan-list-since:${stationId}`, String(session.serverTime));
    } catch {
      /* Storage is optional. */
    }
    setSince(session.serverTime);
  };
  const showEarlier = () => {
    try {
      localStorage.removeItem(`bord-scan-list-since:${stationId}`);
    } catch {
      /* Storage is optional. */
    }
    setSince(null);
  };

  return {
    enabled,
    stationId,
    setStationId,
    stationName: session?.name ?? stations.find((s) => s.id === stationId)?.name ?? '',
    loaded: !!session,
    since,
    state,
    offline,
    announcement,
    items,
    unnamed,
    meals,
    busy,
    anyScans: entries.length > 0,
    liveCount: items.filter((item) => !item.removed && item.batch).length,
    refresh,
    remove,
    startNew,
    showEarlier,
  };
}
