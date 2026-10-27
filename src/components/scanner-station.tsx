'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from './page-header';
import { FoodCatalogPicker } from './food-catalog-picker';
import { createClientUuid } from '@/lib/client/client-uuid';
import type {
  BoundScannerOperation,
  ScannerControl,
  ScannerState,
} from '@/lib/domain/scanner-station';
import { pantryBatchActionSchema } from '@/lib/domain/pantry';
import { boundScannerOperationSchema } from '@/lib/domain/scanner-station';
import type { ScannerResult } from '@/lib/domain/scanner';
import styles from './scanner-station.module.css';

type Option = { id: string; name: string };
type Operation = {
  id: string;
  request: BoundScannerOperation | null;
  result: ScannerResult;
  status: string;
  undoneBy: string | null;
};
type Event = {
  operationId: string | null;
  status: string;
  message: string;
  time: number;
  barcode?: string;
  batchId?: string;
  command?: BoundScannerOperation['command'];
  submission?: string;
};
type Detail = {
  id: string;
  name: string;
  instanceId: string;
  bindingId: string;
  stale: boolean;
  state: ScannerState | null;
  operations: Operation[];
  events: Event[];
};
type CountDraft = {
  locationId: string;
  counts: {
    batchId: string;
    expectedVersion: number;
    quantityRemaining: number;
    unit: string;
    name: string;
    original: number;
  }[];
};
type Lookup = {
  kind: string;
  message?: string;
  product?: { id: string; name: string };
  prepared?: BoundScannerOperation['prepared'];
  batch?: {
    id: string;
    version: number;
    name: string;
    quantity: number;
    unit: string;
    locationId: string;
  };
  batches?: { id: string; version: number; quantity: number; unit: string; location: string }[];
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/scanner/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ?? result.message ?? 'Bòrd could not complete this request.',
    );
  return result as T;
}
export function ScannerStation({
  stations,
  keys,
  products,
  locations,
  shopping,
  canEdit,
  canRegister,
}: {
  stations: Option[];
  keys: Option[];
  products: (Option & { unit: string })[];
  locations: Option[];
  shopping: (Option & { items: (Option & { updatedAt: string })[] })[];
  canEdit: boolean;
  canRegister: boolean;
}) {
  const router = useRouter();
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [barcode, setBarcode] = useState('');
  const [batchId, setBatchId] = useState('');
  const [location, setLocation] = useState('');
  const [supersedes, setSupersedes] = useState<string | null>(null);
  const [reviewCommand, setReviewCommand] = useState<BoundScannerOperation['command'] | null>(null);
  const [countDraft, setCountDraft] = useState<CountDraft | null>(null);
  const [recoveredBinding, setRecoveredBinding] = useState('');
  const [pending, setPending] = useState<BoundScannerOperation | null>(null);
  const pendingRef = useRef<BoundScannerOperation | null>(null);
  const lock = useRef(false);
  const [listId, setListId] = useState(shopping[0]?.id ?? '');
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const refresh = useCallback(async () => {
    if (!stationId) return;
    try {
      const next = await api<Detail>(`stations/${stationId}`);
      setDetail(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [stationId]);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);
  const storageKey = detail ? `bord-scanner-attempt:${detail.bindingId}` : '';
  useEffect(() => {
    if (!storageKey) return;
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        const parsed = saved ? boundScannerOperationSchema.parse(JSON.parse(saved)) : null;
        if (parsed && parsed.bindingId !== storageKey.split(':').at(-1))
          throw new Error('Binding mismatch');
        pendingRef.current = parsed;
        setPending(parsed);
        const counts = localStorage.getItem(`${storageKey}:counts`);
        if (counts) {
          const draft = JSON.parse(counts) as CountDraft;
          boundScannerOperationSchema.shape.command.parse({
            type: 'stocktake',
            counts: draft.counts.map(({ batchId, expectedVersion, quantityRemaining, unit }) => ({
              batchId,
              expectedVersion,
              quantityRemaining,
              unit,
            })),
          });
          setCountDraft(draft);
        } else setCountDraft(null);
        setRecoveredBinding(storageKey.split(':').at(-1) ?? '');
      } catch {
        setError(
          'The saved browser attempt could not be read. Keep this browser data and reconcile the station history.',
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  async function task(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      void refresh();
    }
  }
  async function submit(
    command: BoundScannerOperation['command'],
    prepared?: BoundScannerOperation['prepared'],
    replaceId?: string,
  ) {
    if (!detail) return;
    const operation =
      pendingRef.current ??
      ({
        contractVersion: 2,
        operationId: createClientUuid(),
        stationId: detail.id,
        instanceId: detail.instanceId,
        bindingId: detail.bindingId,
        command,
        ...(prepared ? { prepared } : {}),
        ...(replaceId ? { supersedesOperationId: replaceId } : {}),
      } satisfies BoundScannerOperation);
    if (!pendingRef.current) {
      localStorage.setItem(storageKey, JSON.stringify(operation));
      pendingRef.current = operation;
      setPending(operation);
    }
    const response = await fetch('/api/v1/scanner/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    });
    const result = (await response.json()) as ScannerResult;
    if (
      result.operationId === operation.operationId &&
      result.bindingId === operation.bindingId &&
      result.instanceId === operation.instanceId &&
      result.stationId === operation.stationId &&
      ['succeeded', 'needs_review'].includes(result.outcome ?? '')
    ) {
      localStorage.removeItem(storageKey);
      pendingRef.current = null;
      setPending(null);
      setMessage(result.message);
      setSupersedes(null);
      setReviewCommand(null);
      if (result.outcome === 'needs_review') throw new Error(result.message);
      if (operation.command.type === 'stocktake') saveCountDraft(null);
    } else
      throw new Error(
        'Outcome is unresolved. Retry the saved operation; its UUID and command will stay unchanged.',
      );
  }
  function saveCountDraft(draft: CountDraft | null) {
    if (draft && !draft.counts.length) draft = null;
    if (draft) localStorage.setItem(`${storageKey}:counts`, JSON.stringify(draft));
    else localStorage.removeItem(`${storageKey}:counts`);
    setCountDraft(draft);
  }
  function control(command: ScannerControl) {
    void task(async () => {
      if (!detail?.state) return;
      await api(`stations/${detail.id}/controls`, {
        id: createClientUuid(),
        bootId: detail.state.bootId,
        stateRevision: detail.state.revision,
        command,
      });
      setMessage('Control sent. Wait for the station status to acknowledge it.');
    });
  }
  async function search() {
    const next = await api<Lookup>('lookups', {
      stationId,
      ...(batchId ? { batchId } : { barcode }),
      ...(location ? { locationId: location } : {}),
    });
    setLookup(next);
    return next;
  }
  function chooseReview(
    id: string,
    command?: BoundScannerOperation['command'],
    code?: string,
    batch?: string,
  ) {
    setSupersedes(id);
    setReviewCommand(command ?? null);
    setBarcode(code ?? (command && 'barcode' in command ? command.barcode : ''));
    setBatchId(batch ?? (command && 'batchId' in command ? command.batchId : ''));
    setLookup(null);
    setMessage(
      'Review the saved product, exact amount and location, then submit a corrected operation.',
    );
  }
  const state = detail?.state;
  const disabled = busy || !canEdit || !!pending || recoveredBinding !== detail?.bindingId;
  const controlsDisabled = busy || !canEdit || !state || !!detail?.stale;
  const uniqueReviews =
    detail?.events.filter(
      (e, i, all) =>
        e.status === 'review' &&
        e.operationId &&
        !detail.operations.some(
          (o) =>
            o.id === e.operationId ||
            (o.status === 'succeeded' && o.request?.supersedesOperationId === e.operationId),
        ) &&
        all.findIndex((v) => v.operationId === e.operationId) === i,
    ) ?? [];
  const activeList = shopping.find((l) => l.id === listId);
  return (
    <main className={styles.main}>
      <PageHeader
        title="Scanner station"
        description="Scan groceries into Pantry or record a recipe as cooked. A scanner beep means read; Saved means Bòrd completed the transaction."
        actions={
          <>
            <Link className="text-button" href="/pantry">
              Pantry
            </Link>
            <Link className="text-button" href="/scanner/cards">
              Print scanner cards
            </Link>
          </>
        }
      />
      <label>
        Station
        <select
          value={stationId}
          disabled={!!pending || busy}
          onChange={(e) => {
            setStationId(e.target.value);
            setDetail(null);
            setLookup(null);
            setSupersedes(null);
          }}
        >
          <option value="">Choose station</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {pending && (
        <section className={styles.warning}>
          <h2>Delivery unresolved</h2>
          <p>
            Operation {pending.operationId}. Other browser changes are paused until its outcome is
            known. Retrying preserves this command.
          </p>
          <button disabled={busy} onClick={() => void task(() => submit(pending.command))}>
            Retry saved operation
          </button>
        </section>
      )}
      {detail && (
        <>
          <section className={styles.status} aria-label="Current scanner status">
            <h2>
              {detail.name} ·{' '}
              {detail.stale
                ? 'Offline / stale'
                : state?.readerConnected
                  ? 'Scanner connected'
                  : 'Reader disconnected'}
            </h2>
            <p className={styles.mode} aria-label="Station mode">
              {detail.stale
                ? 'Status unavailable'
                : state?.action
                  ? `NEXT BATCH: ${state.action.toUpperCase()}`
                  : (state?.mode.toUpperCase() ?? 'IDLE')}
            </p>
            <p>
              Next quantity: {state?.packages ?? 1} package(s) · Location:{' '}
              {locations.find((l) => l.id === state?.locationId)?.name ?? 'Product default'}
            </p>
            <p>
              Queue: {state?.queueCount ?? 0} · Needs review: {state?.reviewCount ?? 0}
              {state?.expiresAt
                ? ` · Expires ${new Date(state.expiresAt * 1000).toLocaleTimeString()}`
                : ''}
            </p>
            <div className={styles.row}>
              {(['idle', 'add', 'remove', 'lookup', 'stocktake'] as const).map((mode) => (
                <button
                  key={mode}
                  disabled={controlsDisabled}
                  aria-pressed={!detail.stale && state?.mode === mode}
                  onClick={() => control({ control: 'mode', mode })}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
              <button disabled={controlsDisabled} onClick={() => control({ control: 'reset' })}>
                Reset controls
              </button>
            </div>
            <div className={styles.row}>
              <label>
                Next packages
                <input
                  aria-label="Next packages"
                  type="number"
                  min="1"
                  max="99"
                  defaultValue="1"
                  onBlur={(e) => {
                    if (e.target.value && !controlsDisabled)
                      control({ control: 'quantity', packages: Number(e.target.value) });
                  }}
                  disabled={controlsDisabled}
                />
              </label>
              <label>
                Next location
                <select
                  value={state?.locationId ?? ''}
                  disabled={controlsDisabled}
                  onChange={(e) =>
                    control({ control: 'location', locationId: e.target.value || null })
                  }
                >
                  <option value="">Product default</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.row}>
              {(['open', 'freeze', 'thaw', 'move', 'mark_empty', 'discard', 'donate'] as const).map(
                (action) => (
                  <button
                    key={action}
                    disabled={controlsDisabled}
                    onClick={() => control({ control: 'action', action })}
                  >
                    Next batch: {action.replaceAll('_', ' ')}
                  </button>
                ),
              )}
            </div>
          </section>
          <section>
            <h2>Look up or review a scan</h2>
            <p>
              Retail barcodes identify a product. Batch labels identify the exact stock to open,
              move or count. Stocktake changes require a reviewed count.
            </p>
            {supersedes && (
              <p>
                Correcting {supersedes}{' '}
                <button
                  onClick={() => {
                    setSupersedes(null);
                    setReviewCommand(null);
                  }}
                >
                  Cancel correction
                </button>
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void task(async () => {
                  await search();
                });
              }}
              className={styles.row}
            >
              <label>
                Retail barcode
                <input
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    setBatchId('');
                    setLookup(null);
                  }}
                />
              </label>
              <label>
                Batch ID
                <input
                  value={batchId}
                  onChange={(e) => {
                    setBatchId(e.target.value);
                    setBarcode('');
                    setLookup(null);
                  }}
                />
              </label>
              <label>
                Destination / saved location
                <select
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setLookup(null);
                  }}
                >
                  <option value="">Product default</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy || (!barcode && !batchId)}>Look up</button>
            </form>
            {supersedes && reviewCommand?.type === 'recipe' && (
              <form
                className={styles.row}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void task(() =>
                    submit(
                      {
                        ...reviewCommand,
                        expectedRevision: Number(data.get('revision')),
                        servings: Number(data.get('servings')),
                      },
                      undefined,
                      supersedes,
                    ),
                  );
                }}
              >
                <p>
                  This recipe card was rejected. Review the recipe in Recipebook before correcting
                  its revision or yield.
                </p>
                <label>
                  Reviewed revision
                  <input
                    name="revision"
                    type="number"
                    min="1"
                    defaultValue={reviewCommand.expectedRevision}
                    required
                  />
                </label>
                <label>
                  Reviewed servings
                  <input
                    name="servings"
                    type="number"
                    min="0.001"
                    max="100"
                    step="any"
                    defaultValue={reviewCommand.servings}
                    required
                  />
                </label>
                <button disabled={disabled}>Submit corrected rejected card</button>
              </form>
            )}
            {lookup && (
              <div className={styles.lookup}>
                <h3>{lookup.product?.name ?? lookup.batch?.name ?? 'Product needs review'}</h3>
                <p>{lookup.message}</p>
                {lookup.prepared && (
                  <>
                    <p>
                      Saved package: {lookup.prepared.packageAmount} {lookup.prepared.packageUnit}.
                      Adding requires a destination.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const values = new FormData(e.currentTarget);
                        void task(async () => {
                          const current = await search();
                          if (!current.prepared)
                            throw new Error('Review the product defaults first.');
                          const type = String(values.get('type')) as 'pantry_add' | 'pantry_remove';
                          await submit(
                            {
                              type,
                              barcode,
                              packages: Number(values.get('packages')),
                              ...(type === 'pantry_add' && current.prepared.locationId
                                ? { locationId: current.prepared.locationId }
                                : {}),
                            },
                            current.prepared,
                            supersedes ?? undefined,
                          );
                        });
                      }}
                      className={styles.row}
                    >
                      <label>
                        Action
                        <select
                          name="type"
                          defaultValue={
                            reviewCommand?.type === 'pantry_remove' ? 'pantry_remove' : 'pantry_add'
                          }
                        >
                          <option value="pantry_add">Add packages</option>
                          <option value="pantry_remove">Remove packages</option>
                        </select>
                      </label>
                      <label>
                        Packages
                        <input
                          name="packages"
                          type="number"
                          min="1"
                          max="99"
                          defaultValue={
                            reviewCommand && 'packages' in reviewCommand
                              ? reviewCommand.packages
                              : 1
                          }
                          required
                        />
                      </label>
                      <button disabled={disabled}>Save reviewed packages</button>
                    </form>
                  </>
                )}
                {lookup.kind === 'review' && (
                  <>
                    <FoodCatalogPicker
                      context="product"
                      defaultQuery={barcode}
                      initialTab="barcode"
                      locations={locations.map((l) => ({ id: l.id, path: l.name }))}
                      onImported={() => {
                        setMessage(
                          'Product created or selected without adding stock. Review its verified barcode, package defaults and storage locations in Pantry, then look up this scan again.',
                        );
                        setLookup(null);
                      }}
                    />
                    <Link href="/pantry">Review product defaults in Pantry</Link>
                  </>
                )}
                {lookup.batches?.map((b) => (
                  <p key={b.id}>
                    {b.quantity} {b.unit} · {b.location}{' '}
                    <button
                      onClick={() => {
                        setBatchId(b.id);
                        setBarcode('');
                        setLookup(null);
                      }}
                    >
                      Review this batch
                    </button>
                  </p>
                ))}
                {lookup.batch && (
                  <form
                    className={styles.row}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget),
                        batch = lookup.batch!;
                      const type = String(data.get('action')) as
                        'open' | 'freeze' | 'thaw' | 'move' | 'mark_empty' | 'discard' | 'donate';
                      void task(async () => {
                        if (type === 'move' && !location)
                          throw new Error('Select a destination first.');
                        await submit(
                          {
                            type: 'batch_action',
                            batchId: batch.id,
                            action: pantryBatchActionSchema.parse({
                              type,
                              expectedVersion: batch.version,
                              note: String(data.get('note')),
                              ...(type === 'move' || type === 'freeze'
                                ? { locationId: location || undefined }
                                : {}),
                              ...(type === 'discard' || type === 'donate'
                                ? {
                                    reason:
                                      String(data.get('note')) || 'Reviewed scanner batch action',
                                  }
                                : {}),
                            }),
                          },
                          undefined,
                          supersedes ?? undefined,
                        );
                      });
                    }}
                  >
                    <label>
                      Reviewed batch action
                      <select name="action">
                        {['open', 'freeze', 'thaw', 'move', 'mark_empty', 'discard', 'donate'].map(
                          (a) => (
                            <option key={a} value={a}>
                              {a.replaceAll('_', ' ')}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Reason / note
                      <input name="note" maxLength={240} />
                    </label>
                    <button disabled={disabled}>Save batch action</button>
                  </form>
                )}
                {lookup.batch && (
                  <form
                    className={styles.row}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const values = new FormData(e.currentTarget);
                      const batch = lookup.batch!;
                      void task(async () => {
                        if (countDraft && countDraft.locationId !== batch.locationId)
                          throw new Error(
                            'Finish or clear the current location count before counting another location.',
                          );
                        const counts = (countDraft?.counts ?? []).filter(
                          (c) => c.batchId !== batch.id,
                        );
                        if (counts.length >= 50)
                          throw new Error('Save this draft before adding more than 50 batches.');
                        saveCountDraft({
                          locationId: batch.locationId,
                          counts: [
                            ...counts,
                            {
                              batchId: batch.id,
                              expectedVersion: batch.version,
                              quantityRemaining: Number(values.get('quantity')),
                              unit: batch.unit,
                              name: batch.name,
                              original: batch.quantity,
                            },
                          ],
                        });
                        setMessage(
                          'Count captured in a local draft. No stock changed. Review the full draft before saving.',
                        );
                      });
                    }}
                  >
                    <p>
                      Current stock: {lookup.batch.quantity} {lookup.batch.unit} · Revision{' '}
                      {lookup.batch.version}
                    </p>
                    <label>
                      Counted quantity ({lookup.batch.unit})
                      <input
                        name="quantity"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={lookup.batch.quantity}
                        required
                      />
                    </label>
                    <button disabled={disabled}>Add count to draft</button>
                  </form>
                )}
              </div>
            )}
          </section>
          {countDraft && (
            <section>
              <h2>
                Review stocktake draft ·{' '}
                {locations.find((l) => l.id === countDraft.locationId)?.name}
              </h2>
              <p>
                Only these observed batches change. Unobserved stock stays unchanged. Any
                intervening batch edit rejects the entire draft.
              </p>
              {countDraft.counts.map((c) => (
                <p key={c.batchId}>
                  {c.name}: {c.original} → {c.quantityRemaining} {c.unit} · baseline revision{' '}
                  {c.expectedVersion}{' '}
                  <button
                    disabled={disabled}
                    onClick={() =>
                      saveCountDraft({
                        ...countDraft,
                        counts: countDraft.counts.filter((v) => v.batchId !== c.batchId),
                      })
                    }
                  >
                    Remove count
                  </button>
                </p>
              ))}
              <button
                disabled={disabled || !countDraft.counts.length}
                onClick={() =>
                  void task(async () => {
                    await submit(
                      {
                        type: 'stocktake',
                        counts: countDraft.counts.map(
                          ({ batchId, expectedVersion, quantityRemaining, unit }) => ({
                            batchId,
                            expectedVersion,
                            quantityRemaining,
                            unit,
                          }),
                        ),
                      },
                      undefined,
                      supersedes ?? undefined,
                    );
                    saveCountDraft(null);
                  })
                }
              >
                Apply reviewed count draft
              </button>
              <button disabled={busy || !!pending} onClick={() => saveCountDraft(null)}>
                Clear local count draft
              </button>
            </section>
          )}
          <section>
            <h2>Shopping and leftovers</h2>
            <p>
              Shopping additions create demand. Purchased groceries enter Pantry only through
              intake. Leftovers link to an existing completed cook and do not deduct its ingredients
              again.
            </p>
            <form
              className={styles.row}
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                const type = String(values.get('type'));
                void task(async () => {
                  const quantity = Number(values.get('quantity')),
                    unit = String(values.get('unit'));
                  if (type === 'shopping_add')
                    await submit({ type, listId, productId, quantity, unit });
                  else if (type === 'shopping_intake') {
                    const item = activeList?.items.find((i) => i.id === values.get('itemId'));
                    if (!item) throw new Error('Select a current shopping item.');
                    if (!location) throw new Error('Select a destination above.');
                    await submit({
                      type,
                      listId,
                      itemId: item.id,
                      expectedUpdatedAt: item.updatedAt,
                      productId,
                      quantity,
                      unit,
                      locationId: location,
                      complete: values.get('complete') === 'on',
                    });
                  } else {
                    if (!location) throw new Error('Select a destination above.');
                    await submit({
                      type: 'leftover',
                      cookSessionId: String(values.get('cookSessionId')),
                      productId,
                      quantity,
                      unit,
                      locationId: location,
                    });
                  }
                });
              }}
            >
              <label>
                Workflow
                <select name="type">
                  <option value="shopping_add">Add to shopping list</option>
                  <option value="shopping_intake">Intake purchased groceries</option>
                  <option value="leftover">Save cooked leftovers</option>
                </select>
              </label>
              <label>
                List
                <select value={listId} onChange={(e) => setListId(e.target.value)}>
                  <option value="">Choose list</option>
                  {shopping.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Shopping item (intake)
                <select name="itemId">
                  <option value="">Choose item</option>
                  {activeList?.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pantry product
                <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Exact amount
                <input name="quantity" type="number" min="0.000001" step="any" required />
              </label>
              <label>
                Unit
                <input
                  name="unit"
                  defaultValue={products.find((p) => p.id === productId)?.unit ?? 'g'}
                  required
                />
              </label>
              <label>
                Cook session (leftovers)
                <select name="cookSessionId">
                  <option value="">Choose completed cooking</option>
                  {detail.operations
                    .filter(
                      (o) => o.result.cookSessionId && o.status === 'succeeded' && !o.undoneBy,
                    )
                    .map((o) => (
                      <option key={o.id} value={o.result.cookSessionId}>
                        {o.result.message}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="complete" /> Finish shopping intake
              </label>
              <button disabled={disabled}>Save reviewed workflow</button>
            </form>
            <Link href="/nutrition">Review personal nutrition separately</Link>
          </section>
          <section>
            <h2>Needs review</h2>
            {detail.operations
              .filter(
                (o) =>
                  o.status === 'needs_review' &&
                  !detail.operations.some(
                    (n) =>
                      n.status === 'succeeded' &&
                      n.request?.supersedesOperationId ===
                        (o.request?.supersedesOperationId ?? o.id),
                  ),
              )
              .map((o) => (
                <article key={o.id}>
                  <p>
                    {o.result.message} · {o.id}
                  </p>
                  <button
                    disabled={disabled}
                    onClick={() =>
                      chooseReview(o.request?.supersedesOperationId ?? o.id, o.request?.command)
                    }
                  >
                    Review correction
                  </button>
                </article>
              ))}
            {uniqueReviews.map((e) => (
              <article key={e.operationId}>
                <p>{e.message}</p>
                {e.submission === 'not_submitted' ? (
                  <button
                    disabled={disabled}
                    onClick={() => chooseReview(e.operationId!, e.command, e.barcode, e.batchId)}
                  >
                    Review unsubmitted scan
                  </button>
                ) : (
                  <p>
                    Delivery may be uncertain. Reconcile the bridge queue before issuing another
                    action.
                  </p>
                )}
              </article>
            ))}
          </section>
          <section>
            <h2>Recent transactions</h2>
            {detail.operations.map((o) => (
              <article key={o.id}>
                <strong>{o.status === 'succeeded' ? 'SAVED' : 'NEEDS REVIEW'}</strong>
                <p>{o.result.message}</p>
                <small>{o.id}</small>
                {o.status === 'succeeded' && o.result.undoable && !o.undoneBy && (
                  <button
                    disabled={disabled}
                    onClick={() =>
                      void task(() => submit({ type: 'undo', targetOperationId: o.id }))
                    }
                  >
                    Undo this transaction
                  </button>
                )}
                {o.undoneBy && <p>Reversed by {o.undoneBy}</p>}
              </article>
            ))}
          </section>
          <section>
            <h2>Live station activity</h2>
            {detail.events.slice(0, 20).map((e, i) => (
              <p key={`${e.operationId}-${i}`}>
                <strong>{e.status.toUpperCase()}</strong> · {e.message}
                {(e.barcode || e.batchId) && (
                  <button
                    onClick={() => {
                      setBarcode(e.barcode ?? '');
                      setBatchId(e.batchId ?? '');
                      setLookup(null);
                    }}
                  >
                    Look up details
                  </button>
                )}
              </p>
            ))}
          </section>
        </>
      )}
      {canRegister && (
        <details>
          <summary>Register a scanner station</summary>
          <p>
            Create a dedicated scoped key in <Link href="/settings/api-keys">API key settings</Link>
            , then bind it here. Keep the key secret in the local bridge configuration.
          </p>
          <form
            className={styles.row}
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void task(async () => {
                const id = String(data.get('id'));
                await api('stations', {
                  id,
                  name: String(data.get('name')),
                  apiKeyId: String(data.get('apiKeyId')),
                  scannerQuota: data.get('scannerQuota') === 'on',
                });
                router.refresh();
                router.push('/scanner');
              });
            }}
          >
            <label>
              Station ID
              <input name="id" pattern="[a-zA-Z0-9_-]{1,64}" required />
            </label>
            <label>
              Name
              <input name="name" maxLength={80} required />
            </label>
            <label>
              Dedicated key
              <select name="apiKeyId" required>
                <option value="">Choose key</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" name="scannerQuota" defaultChecked /> Set this dedicated key to
              600 requests/minute for station heartbeats and scanning
            </label>
            <button disabled={busy}>Register station</button>
          </form>
        </details>
      )}
    </main>
  );
}
