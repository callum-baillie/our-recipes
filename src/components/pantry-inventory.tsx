'use client';
import { useEffect, useState } from 'react';
import {
  inventoryCountState,
  restoreInventoryCounts,
  type CountDraft,
  type CountBaseline,
} from '@/lib/domain/inventory-count';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Minus, Plus, Save, Trash2, Search, Check } from 'lucide-react';
import { ButtonSpinner } from '@/components/skeleton';
import { PageHeader } from './page-header';
import { KitchenPrintDialog } from './kitchen-print-dialog';
import styles from './pantry-inventory.module.css';
type Stock = {
  id: string;
  name: string;
  location: string;
  unit: string;
  quantity: number | null;
  quantityLabel: string;
  version: number;
  expiry: string | null;
};
export function PantryInventory({ batches, canEdit }: { batches: Stock[]; canEdit: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [drafts, setDrafts] = useState<Record<string, CountDraft>>({});
  const [confirmed, setConfirmed] = useState<Record<string, CountBaseline>>({});
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [pendingBatchIds, setPendingBatchIds] = useState<string[]>([]);
  const [pendingOperation, setPendingOperation] = useState<'save' | 'bulk' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [latestStock, setLatestStock] = useState<
    Record<string, CountBaseline & { status: string }>
  >({});
  const baseline = (batch: Stock) => confirmed[batch.id] ?? batch;
  const stateFor = (batch: Stock) => inventoryCountState(baseline(batch), drafts[batch.id]);
  const changed = batches.filter((batch) => stateFor(batch).dirty);
  const draftKey = 'bord:physical-inventory-counts';
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(draftKey);
        if (stored) {
          const restored = restoreInventoryCounts(
            stored,
            new Set(batches.map((batch) => batch.id)),
          );
          setDrafts(restored);
          if (Object.keys(restored).length)
            setRecoveryMessage(
              'Recovered your unsaved counts. Review them before saving; stock may have changed.',
            );
        }
      } catch {
        setRecoveryMessage(
          'Count recovery is unavailable. Keep this page open until your changes are saved.',
        );
      }
      setRecoveryReady(true);
    });
    return () => cancelAnimationFrame(frame);
    // Recover once, before any draft can overwrite storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!recoveryReady) return;
    try {
      const meaningful = Object.fromEntries(changed.map((batch) => [batch.id, drafts[batch.id]]));
      if (Object.keys(meaningful).length)
        localStorage.setItem(draftKey, JSON.stringify(meaningful));
      else localStorage.removeItem(draftKey);
    } catch {
      queueMicrotask(() =>
        setRecoveryMessage('Changes are only kept in this tab. Save before leaving.'),
      );
    }
  }, [drafts, confirmed, recoveryReady, batches]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!changed.length) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        link &&
        !window.confirm(
          'Leave with unsaved pantry counts? They will be available to recover on this device.',
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
    };
  }, [changed.length]);
  function edit(batch: Stock, patch: Partial<CountDraft>) {
    setMessage('');
    setErrors((current) => {
      const next = { ...current };
      delete next[batch.id];
      return next;
    });
    setDrafts((current) => ({
      ...current,
      [batch.id]: {
        ...(current[batch.id] ?? {
          quantity: String(baseline(batch).quantity ?? ''),
          unit: baseline(batch).unit,
          version: baseline(batch).version,
        }),
        ...patch,
      },
    }));
  }
  async function reviewRecorded(batch: Stock) {
    if (pending) return;
    setPending(true);
    setPendingBatchIds([batch.id]);
    try {
      const response = await fetch(`/api/v1/pantry/batches/${batch.id}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Recorded stock could not be loaded.');
      setLatestStock((current) => ({
        ...current,
        [batch.id]: {
          quantity: body.batch.quantityRemaining,
          unit: body.batch.unit,
          version: body.batch.version,
          status: body.batch.status,
        },
      }));
    } catch (cause) {
      setErrors((current) => ({
        ...current,
        [batch.id]: cause instanceof Error ? cause.message : 'Recorded stock could not be loaded.',
      }));
    } finally {
      setPending(false);
      setPendingBatchIds([]);
    }
  }
  function adoptRecordedBaseline(batch: Stock, keepCount: boolean) {
    const latest = latestStock[batch.id];
    if (!latest) return;
    setConfirmed((current) => ({ ...current, [batch.id]: latest }));
    setSaved((current) => {
      const next = { ...current };
      delete next[batch.id];
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      if (keepCount && next[batch.id])
        next[batch.id] = { ...next[batch.id], version: latest.version };
      else delete next[batch.id];
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[batch.id];
      return next;
    });
    setLatestStock((current) => {
      const next = { ...current };
      delete next[batch.id];
      return next;
    });
    if (['depleted', 'discarded', 'donated'].includes(latest.status)) router.refresh();
    setMessage(
      keepCount
        ? 'Your count is kept for review. Save it when ready.'
        : 'Using the latest recorded stock.',
    );
  }
  async function save(items: Stock[], remove = false, bulk = false) {
    if (pending || !canEdit || !recoveryReady) return;
    setPending(true);
    setPendingBatchIds(items.map((item) => item.id));
    setPendingOperation(remove ? 'remove' : bulk ? 'bulk' : 'save');
    setMessage('');
    let count = 0;
    try {
      for (const batch of items) {
        const raw = stateFor(batch).raw;
        const quantity = Number(raw);
        if (
          !remove &&
          (raw.trim() === '' || !Number.isFinite(quantity) || quantity < 0 || quantity > 1000000)
        ) {
          setErrors((current) => ({
            ...current,
            [batch.id]: 'Enter a count of zero or more. Unknown stock is left unchanged.',
          }));
          continue;
        }
        const unit = stateFor(batch).unit;
        if (!remove && !unit) {
          setErrors((current) => ({
            ...current,
            [batch.id]: 'Choose the unit you counted, such as each, g, or ml.',
          }));
          continue;
        }
        try {
          const response = await fetch(`/api/v1/pantry/batches/${batch.id}/actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              remove
                ? {
                    type: 'discard',
                    expectedVersion: drafts[batch.id]?.version ?? saved[batch.id] ?? batch.version,
                    reason: 'Removed during inventory count',
                  }
                : {
                    type: 'correct',
                    expectedVersion: drafts[batch.id]?.version ?? saved[batch.id] ?? batch.version,
                    quantityRemaining: quantity,
                    unit,
                    reason: 'Physical inventory count',
                  },
            ),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message ?? 'Count could not be saved.');
          setSaved((current) => ({ ...current, [batch.id]: body.batch.version }));
          setConfirmed((current) => ({
            ...current,
            [batch.id]: { quantity, unit, version: body.batch.version },
          }));
          setDrafts((current) => {
            const next = { ...current };
            delete next[batch.id];
            return next;
          });
          setErrors((current) => {
            const next = { ...current };
            delete next[batch.id];
            return next;
          });
          count++;
        } catch (cause) {
          setErrors((current) => ({
            ...current,
            [batch.id]: cause instanceof Error ? cause.message : 'Unable to save. Try again.',
          }));
        }
      }
      setMessage(
        `${count} ${remove ? 'batch' + (count === 1 ? '' : 'es') + ' removed' : 'count' + (count === 1 ? '' : 's') + ' saved'}.`,
      );
      setConfirmRemove(null);
      router.refresh();
    } finally {
      setPending(false);
      setPendingBatchIds([]);
      setPendingOperation(null);
    }
  }
  const visible = batches.filter(
    (batch) =>
      (!location || batch.location === location) &&
      batch.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className={styles.page}>
      <PageHeader
        title="Count your pantry"
        description="Work through each shelf. Enter what is actually there, then save your counts."
        actions={
          <>
            <Link className="text-button" href="/pantry">
              Back to pantry
            </Link>
            <KitchenPrintDialog kind="pantry" />
          </>
        }
      />
      {!canEdit && <p>Choose a household profile to save physical counts.</p>}
      {recoveryMessage && <p role="status">{recoveryMessage}</p>}
      <div className={styles.filters}>
        <label>
          <Search size={18} />
          <input
            type="search"
            placeholder="Find an item…"
            aria-label="Find inventory item"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Inventory location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        >
          <option value="">All locations</option>
          {[...new Set(batches.map((batch) => batch.location))].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className={styles.stock}>
        {visible.map((batch) => {
          const current = stateFor(batch);
          return (
            <article key={batch.id}>
              <div>
                <h2>{batch.name}</h2>
                <p>
                  {batch.location} · Recorded:{' '}
                  {confirmed[batch.id]
                    ? `${confirmed[batch.id].quantity} ${confirmed[batch.id].unit}`
                    : batch.quantityLabel}
                  {batch.expiry ? ` · date: ${batch.expiry}` : ''}
                </p>
                {(current.dirty || saved[batch.id]) && !errors[batch.id] && (
                  <small>
                    {!current.dirty && <Check size={14} />}
                    {current.dirty ? 'Unsaved' : 'Saved'}
                  </small>
                )}
              </div>
              <div className={styles.count}>
                <button
                  disabled={
                    pending ||
                    !canEdit ||
                    !recoveryReady ||
                    current.raw.trim() === '' ||
                    Number(current.raw) <= 0
                  }
                  aria-label={`Decrease ${batch.name}`}
                  onClick={() =>
                    edit(batch, { quantity: String(Math.max(0, Number(current.raw) - 1)) })
                  }
                >
                  <Minus size={18} />
                </button>
                <label>
                  <span>
                    Counted amount <span className="sr-only"> of {batch.name}</span>
                  </span>
                  <input
                    type="number"
                    aria-label={`Counted amount of ${batch.name}`}
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={current.raw}
                    aria-describedby={
                      errors[batch.id]
                        ? `count-error-${batch.id}`
                        : current.dirty && !current.valid
                          ? `count-readiness-${batch.id}`
                          : undefined
                    }
                    aria-invalid={
                      !!errors[batch.id] ||
                      (current.dirty &&
                        (current.quantity === null ||
                          !Number.isFinite(current.quantity) ||
                          current.quantity < 0 ||
                          current.quantity > 1000000))
                    }
                    placeholder="Unknown"
                    disabled={pending || !canEdit || !recoveryReady}
                    onChange={(event) => edit(batch, { quantity: event.target.value })}
                  />
                </label>
                <button
                  disabled={pending || !canEdit || !recoveryReady}
                  aria-label={`Increase ${batch.name}`}
                  onClick={() => edit(batch, { quantity: String(Number(current.raw) + 1) })}
                >
                  <Plus size={18} />
                </button>
                <label>
                  <span>Unit</span>
                  <input
                    aria-label={`Count unit for ${batch.name}`}
                    aria-invalid={current.dirty && !current.unit}
                    aria-describedby={
                      current.dirty && !current.valid ? `count-readiness-${batch.id}` : undefined
                    }
                    value={drafts[batch.id]?.unit ?? baseline(batch).unit}
                    maxLength={30}
                    disabled={pending || !canEdit || !recoveryReady}
                    onChange={(event) => edit(batch, { unit: event.target.value })}
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button
                  disabled={
                    pending || !canEdit || !recoveryReady || !current.dirty || !current.valid
                  }
                  aria-busy={pendingOperation === 'save' && pendingBatchIds.includes(batch.id)}
                  onClick={() => void save([batch])}
                >
                  {pendingOperation === 'save' && pendingBatchIds.includes(batch.id) ? (
                    <ButtonSpinner />
                  ) : (
                    <Save size={17} />
                  )}{' '}
                  {pendingOperation === 'save' && pendingBatchIds.includes(batch.id)
                    ? 'Saving…'
                    : 'Save count'}
                </button>
                <button
                  disabled={pending || !canEdit || !recoveryReady}
                  aria-label={`Remove ${batch.name}`}
                  onClick={() => setConfirmRemove(batch.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              {confirmRemove === batch.id && (
                <div className={styles.confirm}>
                  <p>Remove this batch from active stock? Its inventory history is kept.</p>
                  <button
                    disabled={pending || !canEdit || !recoveryReady}
                    aria-busy={pendingOperation === 'remove' && pendingBatchIds.includes(batch.id)}
                    onClick={() => void save([batch], true)}
                  >
                    {pendingOperation === 'remove' ? <ButtonSpinner /> : null}
                    {pendingOperation === 'remove' ? 'Removing…' : 'Remove batch'}
                  </button>
                  <button
                    disabled={pending || !canEdit || !recoveryReady}
                    onClick={() => setConfirmRemove(null)}
                  >
                    Keep it
                  </button>
                </div>
              )}
              {current.dirty && !current.valid && !errors[batch.id] && (
                <p id={`count-readiness-${batch.id}`} className={styles.error}>
                  Enter a count of zero or more and the unit you counted before saving.
                </p>
              )}
              {errors[batch.id] && (
                <p id={`count-error-${batch.id}`} role="alert" className={styles.error}>
                  {errors[batch.id]} Your count is kept.{' '}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void reviewRecorded(batch)}
                  >
                    Review recorded stock
                  </button>
                </p>
              )}
              {latestStock[batch.id] && (
                <div className={styles.confirm}>
                  <p>
                    Latest recorded stock:{' '}
                    {latestStock[batch.id].quantity === null
                      ? 'Unknown'
                      : latestStock[batch.id].quantity}{' '}
                    {latestStock[batch.id].unit} · {latestStock[batch.id].status}.
                  </p>
                  {['depleted', 'discarded', 'donated'].includes(latestStock[batch.id].status) ? (
                    <p>This batch is inactive. Restore it in Pantry before counting it.</p>
                  ) : (
                    <button type="button" onClick={() => adoptRecordedBaseline(batch, true)}>
                      Keep my count for review
                    </button>
                  )}
                  <button type="button" onClick={() => adoptRecordedBaseline(batch, false)}>
                    Use recorded count
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length && <p>No stock matches this view.</p>}
      <footer className={styles.footer}>
        <span role="status">
          {!changed.length && message
            ? message
            : `${changed.length} unsaved ${changed.length === 1 ? 'change' : 'changes'} · ${visible.length} ${visible.length === 1 ? 'item' : 'items'} in view${changed.filter((batch) => !visible.includes(batch)).length ? ` · ${changed.filter((batch) => !visible.includes(batch)).length} ${changed.filter((batch) => !visible.includes(batch)).length === 1 ? 'change' : 'changes'} outside this view` : ''}`}
        </span>
        {changed.some((batch) => !stateFor(batch).valid) && (
          <small>A count and unit are needed for every change before Save all is available.</small>
        )}
        {changed.some((batch) => !visible.includes(batch)) && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setQuery('');
              setLocation('');
            }}
          >
            Show changes outside this view
          </button>
        )}
        <button
          disabled={
            pending ||
            !canEdit ||
            !changed.length ||
            changed.some((batch) => !stateFor(batch).valid)
          }
          aria-busy={pendingOperation === 'bulk'}
          onClick={() => void save(changed, false, true)}
        >
          {pendingOperation === 'bulk' ? <ButtonSpinner /> : <Save size={18} />}{' '}
          {pendingOperation === 'bulk'
            ? 'Saving…'
            : `Save all ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}`}
        </button>
      </footer>
    </main>
  );
}
