'use client';

import { useEffect, useState } from 'react';
import type { ScanSession } from '@/lib/domain/scanner-session';

export const HANDHELD_HREF = '/pantry/add?mode=scan';
const REVIEWED_EVENT = 'bord:scan-reviewed';

export type ScannerActivity = {
  stations: Array<{ id: string; name: string }>;
  /** A scanner is connected and reporting right now. */
  live: boolean;
  /** Unrecognised barcodes plus scans newer than the last time the list was viewed. */
  toReview: number;
};

type StationSummary = {
  id: string;
  name: string;
  stale: boolean;
  state?: { readerConnected?: boolean } | null;
};

export function scanReviewKey(accountId: string, stationId: string) {
  return `scan-review:${accountId}:${stationId}`;
}

/** Remember that everything up to `latest` has been looked at, on this browser. */
export function markScansReviewed(accountId: string, stationId: string, latest: number) {
  try {
    localStorage.setItem(scanReviewKey(accountId, stationId), String(latest));
  } catch {
    /* Storage is optional. */
  }
  window.dispatchEvent(new Event(REVIEWED_EVENT));
}

export function readScansReviewed(accountId: string, stationId: string) {
  try {
    return Number(localStorage.getItem(scanReviewKey(accountId, stationId))) || 0;
  } catch {
    return 0;
  }
}

export function latestScanTime(session: Pick<ScanSession, 'entries'>) {
  return (
    session.entries
      .map((entry) => Date.parse(entry.time))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] ?? 0
  );
}

/** Scans the household has not looked at yet. Settled and undone scans never need a look. */
export function unreviewedScans(session: ScanSession, reviewedUpTo: number) {
  return session.entries.filter(
    (entry) =>
      entry.state !== 'undone' &&
      !entry.resolved &&
      (entry.state === 'review' || Date.parse(entry.time) > reviewedUpTo),
  ).length;
}

export async function fetchScannerActivity(
  accountId: string,
  signal?: AbortSignal,
): Promise<ScannerActivity | null> {
  const response = await fetch('/api/v1/scanner/stations', { cache: 'no-store', signal });
  if (!response.ok) return null;
  const { stations } = (await response.json()) as { stations: StationSummary[] };
  let toReview = 0;
  for (const station of stations) {
    const sessionResponse = await fetch(
      `/api/v1/scanner/stations/${encodeURIComponent(station.id)}/session`,
      { cache: 'no-store', signal },
    );
    if (!sessionResponse.ok) continue;
    const session = (await sessionResponse.json()) as ScanSession;
    toReview += unreviewedScans(session, readScansReviewed(accountId, station.id));
  }
  return {
    stations: stations.map(({ id, name }) => ({ id, name })),
    live: stations.some((station) => !station.stale && station.state?.readerConnected),
    toReview,
  };
}

/** Polls quietly while the page is visible. Null until the first answer arrives. */
export function useScannerActivity(accountId: string, intervalMs = 15000) {
  const [activity, setActivity] = useState<ScannerActivity | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const next = await fetchScannerActivity(accountId, controller.signal);
        if (next && !controller.signal.aborted) setActivity(next);
      } catch {
        /* Retry on the next foreground refresh. */
      } finally {
        busy = false;
      }
    }
    void check();
    const timer = setInterval(() => void check(), intervalMs);
    const wake = () => void check();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener(REVIEWED_EVENT, wake);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener(REVIEWED_EVENT, wake);
    };
  }, [accountId, intervalMs]);
  return activity;
}
