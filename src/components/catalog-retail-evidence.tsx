'use client';

import { ToastNotice } from './toast-provider';

import { ToastMessage } from './toast-message';
import { useEffect, useRef, useState } from 'react';
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
  return <ScopedRetailEvidence key={JSON.stringify(reference)} reference={reference} />;
}
function ScopedRetailEvidence({ reference }: { reference: CatalogReference }) {
  const [stores, setStores] = useState<Array<{
    id: string;
    name: string;
    catalogStoreId: string | null;
  }> | null>(null);
  const [store, setStore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [identified, setIdentified] = useState('');
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  async function read(enrichment = false) {
    const version = ++requestVersion.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/v1/food-data/catalog/${enrichment ? 'enrichment' : 'retail-evidence'}`,
        {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            enrichment
              ? {
                  lines: [
                    {
                      lineId: 'reviewed-food',
                      productId: reference.canonical_product_id,
                      ...(store ? { storeId: store } : {}),
                    },
                  ],
                }
              : { productId: reference.canonical_product_id, ...(store ? { storeId: store } : {}) },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Evidence is unavailable.');
      if (version !== requestVersion.current || abort.signal.aborted) return;
      setEvidence(enrichment ? (result.lines?.[0]?.evidence ?? null) : result.evidence);
      setIdentified(
        enrichment
          ? result.lines?.[0]?.product
            ? `${result.lines[0].product.name ?? 'Identified source product'} · revision ${result.lines[0].product.revision}`
            : 'No identified product evidence is available.'
          : '',
      );
    } catch (error) {
      if (version === requestVersion.current && !abort.signal.aborted)
        setError(error instanceof Error ? error.message : 'Evidence is unavailable.');
    } finally {
      if (version === requestVersion.current && !abort.signal.aborted) setBusy(false);
    }
  }
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
        onClick={() => void read()}
      >
        {busy ? 'Checking evidence…' : 'Check public evidence'}
      </button>
      <button
        type="button"
        className="secondary-button compact"
        disabled={busy || !stores}
        onClick={() => void read(true)}
      >
        Review identified product enrichment
      </button>
      {identified ? (
        <ToastNotice>{identified}. This read has not changed the shopping list.</ToastNotice>
      ) : null}
      {evidence && (
        <ToastNotice>
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
        </ToastNotice>
      )}
      {error && <ToastMessage message={error} tone="error" />}
    </section>
  );
}
