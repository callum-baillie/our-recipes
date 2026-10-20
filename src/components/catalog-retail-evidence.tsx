'use client';
import { useEffect, useState } from 'react';
import { AsyncSkeleton } from '@/components/skeleton';
import type { CatalogReference } from '@/lib/domain/food-data';
import styles from './catalog-store-link.module.css';

type Evidence = {
  availability: string;
  assortment_status: string;
  offers: Record<string, unknown>[];
  placements: Record<string, unknown>[];
  history_truncated: boolean;
  reason: string | null;
};
const evidenceText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 300) : null;
function observationSummary(row: Record<string, unknown>, kind: 'offer' | 'placement') {
  const amount = evidenceText(row.amount_decimal ?? row.amount);
  const detail =
    kind === 'offer'
      ? [
          amount === null ? 'Price not recorded' : `${amount} ${evidenceText(row.currency) ?? ''}`,
          evidenceText(row.package_size),
        ]
      : [
          evidenceText(row.aisle) ? `Aisle ${evidenceText(row.aisle)}` : 'Aisle not recorded',
          evidenceText(row.department),
        ];
  return [
    ...detail,
    evidenceText(row.channel)?.replaceAll('_', ' '),
    evidenceText(row.observed_at)
      ? `Observed ${evidenceText(row.observed_at)}`
      : 'Observation date not recorded',
    evidenceText(row.valid_until) ? `Source valid until ${evidenceText(row.valid_until)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function CatalogRetailEvidence({ reference }: { reference: CatalogReference }) {
  const [stores, setStores] = useState<Array<{
    id: string;
    name: string;
    catalogStoreId: string | null;
  }> | null>(null);
  const [store, setStore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/supermarket-profiles')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (alive) setStores(data.profiles ?? []);
      })
      .catch(() => {
        if (alive) {
          setStores([]);
          setError('Saved branches could not be loaded.');
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!reference.canonical_product_id) return null;
  return (
    <section className={styles.panel} aria-label="Store evidence">
      <h3>Store evidence</h3>
      <p className={styles.help}>
        Public listings and historical prices do not confirm current stock. Checking does not add an
        item to your cart or pantry.
      </p>
      {!stores ? (
        <AsyncSkeleton label="Loading saved branches" variant="select" />
      ) : (
        <label>
          Branch
          <select
            value={store}
            disabled={busy}
            onChange={(event) => {
              setStore(event.target.value);
              setEvidence(null);
            }}
          >
            <option value="">No branch selected</option>
            {stores
              .filter((s) => s.catalogStoreId)
              .map((s) => (
                <option key={s.id} value={s.catalogStoreId!}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="secondary-button compact"
        disabled={busy || !stores}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/v1/food-data/catalog/retail-evidence', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: reference.canonical_product_id,
                ...(store ? { storeId: store } : {}),
              }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error?.message ?? 'Evidence is unavailable.');
            setEvidence(result.evidence);
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Evidence is unavailable.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Checking evidence…' : 'Check public evidence'}
      </button>
      {evidence && (
        <div role="status" className={styles.saved}>
          <span>
            Availability:{' '}
            {evidence.availability === 'unknown'
              ? 'Unknown'
              : `source reports ${evidence.availability}`}
          </span>
          <small>
            {evidence.offers.length
              ? `${evidence.offers.length} public offer observations; dates and package sizes may differ.`
              : 'No public offers available.'}
          </small>
          <small>
            {evidence.placements.length
              ? `${evidence.placements.length} placement observations; your saved route takes priority.`
              : 'No branch aisle placement available.'}
          </small>
          {evidence.history_truncated && (
            <small>
              Only the bounded source history is available; these observations are not the complete
              record.
            </small>
          )}
          {evidence.reason && <small>{evidence.reason.replaceAll('_', ' ')}</small>}
          {(evidence.offers.length > 0 || evidence.placements.length > 0) && (
            <details>
              <summary>Observation dates, channels and details</summary>
              <ul>
                {evidence.offers.map((row, index) => (
                  <li key={`offer-${index}`}>{observationSummary(row, 'offer')}</li>
                ))}
                {evidence.placements.map((row, index) => (
                  <li key={`placement-${index}`}>{observationSummary(row, 'placement')}</li>
                ))}
              </ul>
              <p>
                These are source observations, not a promise of current stock or your saved aisle
                route.
              </p>
            </details>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
