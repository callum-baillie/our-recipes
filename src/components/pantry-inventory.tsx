'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Minus, Plus, Save, Trash2, Search, Check } from 'lucide-react';
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
  const [units, setUnits] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<Record<string, number>>({});
  async function save(items: Stock[], remove = false) {
    if (pending || !canEdit) return;
    setPending(true);
    setMessage('');
    let count = 0;
    try {
      for (const batch of items) {
        const raw = drafts[batch.id] ?? String(batch.quantity ?? '');
        const quantity = Number(raw);
        if (!remove && (raw.trim() === '' || !Number.isFinite(quantity) || quantity < 0)) {
          setErrors((current) => ({
            ...current,
            [batch.id]: 'Enter a count of zero or more. Unknown stock is left unchanged.',
          }));
          continue;
        }
        const unit = (units[batch.id] ?? batch.unit).trim();
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
                    expectedVersion: saved[batch.id] ?? batch.version,
                    reason: 'Removed during inventory count',
                  }
                : {
                    type: 'correct',
                    expectedVersion: saved[batch.id] ?? batch.version,
                    quantityRemaining: quantity,
                    unit,
                    reason: 'Physical inventory count',
                  },
            ),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message ?? 'Count could not be saved.');
          setSaved((current) => ({ ...current, [batch.id]: body.batch.version }));
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
        `${count} ${remove ? 'item removed' : 'count' + (count === 1 ? '' : 's') + ' saved'}.`,
      );
      setConfirmRemove(null);
      router.refresh();
    } finally {
      setPending(false);
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
        {visible.map((batch) => (
          <article key={batch.id}>
            <div>
              <h2>{batch.name}</h2>
              <p>
                {batch.location} · recorded: {batch.quantityLabel}
                {batch.expiry ? ` · date: ${batch.expiry}` : ''}
              </p>
              {saved[batch.id] && !errors[batch.id] && (
                <small>
                  <Check size={14} />
                  Saved
                </small>
              )}
            </div>
            <div className={styles.count}>
              <button
                disabled={pending || !canEdit}
                aria-label={`Decrease ${batch.name}`}
                onClick={() =>
                  setDrafts((current) => ({
                    ...current,
                    [batch.id]: String(
                      Math.max(0, Number(current[batch.id] ?? batch.quantity ?? 0) - 1),
                    ),
                  }))
                }
              >
                <Minus size={18} />
              </button>
              <label>
                <span className="sr-only">Count of {batch.name}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={drafts[batch.id] ?? String(batch.quantity ?? '')}
                  placeholder="Unknown"
                  disabled={pending || !canEdit}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [batch.id]: event.target.value }))
                  }
                />
              </label>
              <button
                disabled={pending || !canEdit}
                aria-label={`Increase ${batch.name}`}
                onClick={() =>
                  setDrafts((current) => ({
                    ...current,
                    [batch.id]: String(Number(current[batch.id] ?? batch.quantity ?? 0) + 1),
                  }))
                }
              >
                <Plus size={18} />
              </button>
              <span>
                {batch.unit || (
                  <input
                    aria-label={`Count unit for ${batch.name}`}
                    placeholder="Unit"
                    value={units[batch.id] ?? ''}
                    maxLength={30}
                    disabled={pending || !canEdit}
                    onChange={(event) =>
                      setUnits((current) => ({ ...current, [batch.id]: event.target.value }))
                    }
                  />
                )}
              </span>
            </div>
            <div className={styles.actions}>
              <button
                disabled={pending || !canEdit || drafts[batch.id] === undefined}
                onClick={() => void save([batch])}
              >
                <Save size={17} />
                Save count
              </button>
              <button
                disabled={pending || !canEdit}
                aria-label={`Remove ${batch.name}`}
                onClick={() => setConfirmRemove(batch.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
            {confirmRemove === batch.id && (
              <div className={styles.confirm}>
                <p>Remove this batch from active stock? Its inventory history is kept.</p>
                <button disabled={pending || !canEdit} onClick={() => void save([batch], true)}>
                  Remove batch
                </button>
                <button disabled={pending || !canEdit} onClick={() => setConfirmRemove(null)}>
                  Keep it
                </button>
              </div>
            )}
            {errors[batch.id] && (
              <p role="alert" className={styles.error}>
                {errors[batch.id]} Refresh the page if someone else changed this batch.
              </p>
            )}
          </article>
        ))}
      </div>
      {!visible.length && <p>No stock matches this view.</p>}
      <footer className={styles.footer}>
        <span role="status">
          {message ||
            `${Object.keys(drafts).length} unsaved counts · ${visible.length} items in view`}
        </span>
        <button
          disabled={pending || !canEdit || !Object.keys(drafts).length}
          onClick={() => void save(batches.filter((batch) => drafts[batch.id] !== undefined))}
        >
          <Save size={18} />
          {pending ? 'Saving…' : 'Save all counts'}
        </button>
      </footer>
    </main>
  );
}
