'use client';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from './page-header';
import { ProductImage, PhotoCredit } from './product-image';
import { createClientUuid } from '@/lib/client/client-uuid';
import {
  INACTIVE_BATCH_STATUSES,
  type ScanSession,
  type ScanSessionEntry,
} from '@/lib/domain/scanner-session';
import styles from './scanner-session.module.css';

type Option = { id: string; name: string };
type Motion = 'in' | 'void' | 'bump';
type Seen = Map<string, { removed: boolean; amount: string }>;

const POLL_MS = 1000;
const MOTION_MS = 1700;
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
const KIND_LABEL: Record<ScanSessionEntry['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  cooked: 'Cooked',
  adjusted: 'Adjusted',
  other: 'Recorded',
};

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

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function gone(entry: ScanSessionEntry) {
  return !!entry.batch && INACTIVE_BATCH_STATUSES.includes(entry.batch.status);
}

/** What the register shows for one scan right now. */
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

export function ScannerSessionList({
  stations,
  canEdit,
}: {
  stations: Option[];
  canEdit: boolean;
}) {
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [session, setSession] = useState<ScanSession | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [editing, setEditing] = useState('');
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState('');
  // Animations only run for changes seen after the first load, never for history.
  const [armed, setArmed] = useState(false);
  const [motion, setMotion] = useState<Record<string, Motion>>({});
  const [tick, setTick] = useState(0);
  const seen = useRef<Seen | null>(null);
  const countRef = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const request = useRef<AbortController | null>(null);

  // Remember the station and where the list was last cleared, per browser.
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = localStorage.getItem('bord-scan-list-station');
      if (saved && stations.some((s) => s.id === saved)) setStationId(saved);
    }, 0);
    return () => clearTimeout(timer);
  }, [stations]);
  useEffect(() => {
    if (!stationId) return;
    const timer = setTimeout(() => {
      localStorage.setItem('bord-scan-list-station', stationId);
      const saved = Number(localStorage.getItem(`bord-scan-list-since:${stationId}`));
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
      const live = next.entries.filter(
        (e) => e.kind === 'added' && e.state === 'saved' && !view(e).removed,
      );
      if (seen.current) {
        const changes: Record<string, Motion> = {};
        const spoken: string[] = [];
        for (const entry of next.entries) {
          const before = seen.current.get(entry.id);
          const now = current.get(entry.id)!;
          if (!before) {
            changes[entry.id] = now.removed ? 'void' : 'in';
            spoken.push(
              now.removed ? `${entry.title} removed` : `${KIND_LABEL[entry.kind]} ${entry.title}`,
            );
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
        if (live.length !== countRef.current) setTick((value) => value + 1);
      }
      countRef.current = live.length;
      seen.current = current;
      setArmed(true);
      setSession(next);
      setOnline(true);
      setError('');
    } catch (e) {
      if (controller.signal.aborted || request.current !== controller) return;
      setOnline(false);
      setError((e as Error).message);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [stationId, since]);
  useEffect(() => {
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
  }, [refresh]);

  async function change(entry: ScanSessionEntry, work: () => Promise<void>) {
    if (busy) return;
    setBusy(entry.id);
    setError('');
    try {
      await work();
      setEditing('');
      setConfirming('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      void refresh();
    }
  }
  function saveQuantity(entry: ScanSessionEntry, value: number) {
    const batch = entry.batch;
    if (!batch) return;
    void change(entry, async () => {
      if (!Number.isFinite(value) || value <= 0)
        throw new Error('Enter an amount above zero, or use Remove.');
      await send(`/api/v1/pantry/batches/${batch.id}/actions`, {
        type: 'correct',
        expectedVersion: batch.version,
        quantityRemaining: value,
        unit: batch.unit,
        approximateState: null,
        reason: 'Corrected from scan list',
        note: '',
      });
    });
  }
  function remove(entry: ScanSessionEntry) {
    if (!session) return;
    const batch = entry.batch;
    void change(entry, async () => {
      if (entry.canUndo && !entry.edited) {
        const operationId = createClientUuid();
        const result = await send('/api/v1/scanner/operations', {
          contractVersion: 2,
          operationId,
          stationId: session.stationId,
          instanceId: session.instanceId,
          bindingId: session.bindingId,
          command: { type: 'undo', targetOperationId: entry.id },
        });
        if (result?.outcome !== 'succeeded')
          throw new Error(result?.message ?? 'This scan could not be removed.');
      } else if (batch && !gone(entry)) {
        await send(`/api/v1/pantry/batches/${batch.id}/actions`, {
          type: 'discard',
          expectedVersion: batch.version,
          reason: 'Removed from scan list',
          note: '',
        });
      } else throw new Error('This scan can no longer be removed here. Use the Pantry page.');
    });
  }

  const entries = session?.entries ?? [];
  const live = entries.filter((e) => e.state === 'saved' && !view(e).removed);
  const added = live.filter((e) => e.kind === 'added').length;
  const voided = entries.filter((e) => e.state !== 'review' && view(e).removed).length;
  const reviews = entries.filter((e) => e.state === 'review').length;
  const last = live.find((e) => e.kind === 'added') ?? null;
  const startNew = () => {
    if (!session) return;
    localStorage.setItem(`bord-scan-list-since:${stationId}`, String(session.serverTime));
    setSince(session.serverTime);
  };
  const showEarlier = () => {
    localStorage.removeItem(`bord-scan-list-since:${stationId}`);
    setSince(null);
  };
  const status = !online
    ? 'Reconnecting…'
    : !session
      ? 'Loading…'
      : session.stale
        ? `${session.name} is offline`
        : session.readerConnected
          ? `${session.name} is ready to scan`
          : `${session.name} has no scanner connected`;

  return (
    <main className={styles.main}>
      <PageHeader
        title="Scan list"
        description="Everything your scanner records, as it happens. Scanning works the same without this page open."
        actions={
          <>
            <Link className="text-button" href="/pantry">
              Pantry
            </Link>
            <Link className="text-button" href="/scanner">
              Scanner station
            </Link>
          </>
        }
      />
      {!stations.length ? (
        <section className={styles.empty}>
          <h2>No scanner station yet</h2>
          <p>
            Register your scanner on the station page and its scans will appear here as they are
            saved.
          </p>
          <Link className="text-button" href="/scanner">
            Set up a station
          </Link>
        </section>
      ) : (
        <div className={styles.register}>
          <section className={styles.display} aria-label="Register display">
            <div className={styles.screen}>
              <p
                className={styles.led}
                data-state={online && session && !session.stale ? 'on' : 'off'}
              >
                <span aria-hidden />
                {status}
              </p>
              <div className={styles.counter}>
                <span className={styles.counterLabel}>Items</span>
                <strong
                  key={tick}
                  className={styles.counterValue}
                  data-tick={tick > 0 ? 'true' : undefined}
                >
                  {added}
                </strong>
              </div>
              {last ? (
                <article
                  key={last.id}
                  className={styles.lastCard}
                  data-live={armed && tick > 0 ? 'true' : undefined}
                  aria-label="Last scanned item"
                >
                  <ProductImage
                    className={styles.lastPhoto}
                    gtin={last.gtin}
                    fallback={<Package size={36} />}
                    eager
                  />
                  <div>
                    <p className={styles.lastLabel}>Last scanned</p>
                    <h2>{last.title}</h2>
                    {last.brand && <p className={styles.lastBrand}>{last.brand}</p>}
                  </div>
                </article>
              ) : (
                <p className={styles.ready}>{session ? 'Ready. Scan an item.' : ' '}</p>
              )}
            </div>
            <div className={styles.controls}>
              {stations.length > 1 && (
                <label>
                  Station
                  <select value={stationId} onChange={(e) => setStationId(e.target.value)}>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className={styles.totals}>
                <strong>{voided}</strong> voided
                {reviews ? (
                  <>
                    {' · '}
                    <strong>{reviews}</strong> to review
                  </>
                ) : null}
              </p>
              <div className={styles.controlButtons}>
                <button type="button" onClick={startNew} disabled={!session || !entries.length}>
                  Start new list
                </button>
                {since && (
                  <button type="button" onClick={showEarlier}>
                    Show earlier scans
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className={styles.receipt} aria-label="Receipt">
            <header className={styles.receiptHead}>
              <span>Receipt</span>
              <span>{session?.name ?? ''}</span>
            </header>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <p className="visually-hidden" role="status" aria-live="polite">
              {announcement}
            </p>
            {session && !entries.length ? (
              <div className={styles.blank}>
                <h2>Nothing scanned yet</h2>
                <p>
                  Scan a product and it will appear here as it is saved.{' '}
                  {since ? 'Earlier scans are hidden.' : 'The list shows the last 12 hours.'}
                </p>
              </div>
            ) : (
              <ol className={styles.list} aria-label="Scanned items">
                {entries.map((entry) => {
                  const { removed: isRemoved, batch, amount } = view(entry);
                  const pending = busy === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className={styles.line}
                      data-state={isRemoved ? 'removed' : entry.state}
                      data-motion={armed ? motion[entry.id] : undefined}
                    >
                      <ProductImage
                        className={styles.thumb}
                        gtin={entry.gtin}
                        fallback={<Package size={20} />}
                      />
                      <div className={styles.lineMain}>
                        <p className={styles.name}>
                          <span>{entry.title}</span>
                        </p>
                        <p className={styles.meta}>
                          <span className={styles.badge} data-kind={entry.kind}>
                            {isRemoved
                              ? 'Removed'
                              : entry.state === 'review'
                                ? 'Needs review'
                                : KIND_LABEL[entry.kind]}
                          </span>
                          <time dateTime={entry.time}>{clock(entry.time)}</time>
                          {entry.brand && <span>{entry.brand}</span>}
                          {batch?.location && <span>{batch.location}</span>}
                          {!entry.gtin && entry.barcode && <span>{entry.barcode}</span>}
                        </p>
                        {entry.state === 'review' && (
                          <p className={styles.note}>
                            {entry.detail}{' '}
                            <Link href="/scanner">Review it on the station page</Link>
                          </p>
                        )}
                      </div>
                      <p className={styles.amount}>
                        <span>{amount}</span>
                        {isRemoved && <em className={styles.stamp}>Void</em>}
                      </p>
                      {canEdit && entry.state !== 'review' && !isRemoved && (
                        <div className={styles.actions}>
                          {editing === entry.id && batch ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                saveQuantity(
                                  entry,
                                  Number(new FormData(e.currentTarget).get('quantity')),
                                );
                              }}
                            >
                              <label>
                                <span className="visually-hidden">Quantity in {batch.unit}</span>
                                <input
                                  name="quantity"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  defaultValue={batch.quantity ?? ''}
                                  autoFocus
                                  required
                                />
                              </label>
                              <span>{batch.unit}</span>
                              <button disabled={pending}>Save</button>
                              <button type="button" onClick={() => setEditing('')}>
                                Cancel
                              </button>
                            </form>
                          ) : confirming === entry.id ? (
                            <>
                              <span>Remove {entry.title}?</span>
                              <button disabled={pending} onClick={() => remove(entry)}>
                                Yes, remove
                              </button>
                              <button type="button" onClick={() => setConfirming('')}>
                                Keep
                              </button>
                            </>
                          ) : (
                            <>
                              {batch && (
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() => {
                                    setConfirming('');
                                    setEditing(entry.id);
                                  }}
                                >
                                  Change quantity
                                </button>
                              )}
                              {(batch || entry.canUndo) && (
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() => {
                                    setEditing('');
                                    setConfirming(entry.id);
                                  }}
                                >
                                  {entry.kind === 'removed' && !batch ? 'Put back' : 'Remove'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {entries.some((entry) => entry.gtin) && <PhotoCredit className={styles.credit} />}
            <div className={styles.tear} aria-hidden />
          </section>
        </div>
      )}
    </main>
  );
}
