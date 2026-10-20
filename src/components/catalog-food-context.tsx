'use client';

import { useEffect, useRef, useState } from 'react';
import {
  catalogContextKey,
  sourcePortionAmount,
  createRequestGeneration,
} from '../../shared/mobile-domain/catalog-measures';
import type { CatalogReference } from '@/lib/domain/food-data';
import type { CatalogMeasure } from '@/lib/domain/bord-catalog';
import styles from './catalog-store-link.module.css';

type Guidance = {
  id: string;
  name: string;
  form: string | null;
  storageState: string | null;
  details: Record<string, string | number | boolean | null>;
  attribution: string;
  license: string;
  preciseExpiry: boolean;
};

/** Optional attributed evidence. Reads never import a product or change stock dates. */
type ContextProps = {
  name: string;
  reference: CatalogReference;
  onSelectMeasure?: (amount: { quantity: number; unit: 'g' }, measure: CatalogMeasure) => void;
};
export function CatalogFoodContext(props: ContextProps) {
  return (
    <ScopedCatalogFoodContext key={catalogContextKey(props.reference, props.name)} {...props} />
  );
}
function ScopedCatalogFoodContext({
  name,
  reference,
  onSelectMeasure,
}: {
  name: string;
  reference: CatalogReference;
  onSelectMeasure?: (amount: { quantity: number; unit: 'g' }, measure: CatalogMeasure) => void;
}) {
  const [measures, setMeasures] = useState<CatalogMeasure[] | null>(null);
  const [guidance, setGuidance] = useState<Guidance[] | null>(null);
  const [busy, setBusy] = useState<'measures' | 'storage-guidance' | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(createRequestGeneration());
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const requests = generation.current;
    return () => {
      requests.next();
      abort.current?.abort();
    };
  }, []);
  async function read(kind: 'measures' | 'storage-guidance') {
    const token = generation.current.next();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const current = () => generation.current.isCurrent(token) && !controller.signal.aborted;
    setBusy(kind);
    setError('');
    try {
      const response = await fetch(`/api/v1/food-data/catalog/${kind}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'measures' ? { reference } : { query: name.slice(0, 200) }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Catalog context could not be loaded.');
      if (!current()) return;
      if (kind === 'measures') setMeasures(body.measures);
      else setGuidance(body.guidance);
    } catch (error) {
      if (!current()) return;
      setError(error instanceof Error ? error.message : 'Catalog context is unavailable.');
    } finally {
      if (current()) setBusy(null);
    }
  }
  return (
    <details className={styles.panel}>
      <summary>Portion measures and storage guidance</summary>
      <p className={styles.help}>
        Source measures apply to this food revision. Storage guidance describes conditions and
        ranges; it does not set a batch expiry date.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className="secondary-button compact"
          disabled={!!busy}
          onClick={() => void read('measures')}
        >
          {busy === 'measures' ? 'Loading measures…' : 'Show source measures'}
        </button>
        <button
          type="button"
          className="secondary-button compact"
          disabled={!!busy}
          onClick={() => void read('storage-guidance')}
        >
          {busy === 'storage-guidance' ? 'Loading guidance…' : 'Find storage guidance'}
        </button>
      </div>
      {measures &&
        (measures.length ? (
          <ul>
            {measures.map((measure, index) => (
              <li key={index}>
                {measure.label}
                {measure.gramWeight !== null ? ` · ${measure.gramWeight} g` : ''}
                {measure.form ? ` · ${measure.form}` : ''}
                {measure.basis ? ` · ${measure.basis}` : ''}
                {measure.description &&
                measure.description !== measure.modifier &&
                measure.description !== measure.label ? (
                  <div>{measure.description}</div>
                ) : null}
                {onSelectMeasure && sourcePortionAmount(measure) ? (
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() => onSelectMeasure(sourcePortionAmount(measure)!, measure)}
                  >
                    Use source portion ({measure.label}) · {measure.gramWeight} g
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No supported measures are recorded for this revision. Enter a measured amount without
            assuming a conversion.
          </p>
        ))}
      {guidance &&
        (guidance.length ? (
          guidance.map((entry) => (
            <div className={styles.saved} key={entry.id}>
              <strong>{entry.name}</strong>
              <span>
                {[entry.form, entry.storageState].filter(Boolean).join(' · ') ||
                  'Read the source conditions below.'}
              </span>
              <dl>
                {Object.entries(entry.details).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll('_', ' ')}</dt>
                    <dd>{value === null ? 'Not recorded' : String(value)}</dd>
                  </div>
                ))}
              </dl>
              <small>
                {entry.attribution} · {entry.license}.{' '}
                {entry.preciseExpiry
                  ? 'Source guidance still requires review for your batch.'
                  : 'Storage ranges are guidance, not an exact expiry.'}
              </small>
            </div>
          ))
        ) : (
          <p>
            No matching guidance exists in the available source pack. This does not establish a
            storage duration.
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
