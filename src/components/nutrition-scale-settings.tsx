'use client';

import { ToastMessage } from './toast-message';
import { BodyCompositionEstimatePanel } from './body-composition-estimate';
import { ButtonSpinner } from '@/components/skeleton';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bodyMetricFields, type BodyMetrics } from '@/lib/domain/body-metrics';
import styles from './nutrition-measurements.module.css';
import { ChevronDown } from 'lucide-react';
export type LatestWeighIn = {
  weightKilograms: number;
  measuredAt: string;
  metrics: BodyMetrics;
  estimate: CompositionEstimate | null;
  sourceType: string;
};
export function NutritionScaleSettings({
  profileId,
  latest,
  imperial,
  onRecord,
  enabled,
  canManage = true,
}: {
  profileId: string;
  latest: LatestWeighIn | null;
  imperial: boolean;
  onRecord: () => void;
  enabled: boolean;
  canManage?: boolean;
}) {
  const [connection, setConnection] = useState<'checking' | 'connected' | 'disconnected' | 'error'>(
    'checking',
  );
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/nutrition/profiles/${profileId}/scale`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Connection check failed');
        const data = await response.json();
        if (!controller.signal.aborted)
          setConnection(data.connected ? 'connected' : 'disconnected');
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnection('error');
      });
    return () => controller.abort();
  }, [profileId, attempt]);
  async function sync() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${profileId}/scale`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Unable to sync your scale.');
      setMessage(
        data.imported
          ? 'Latest weigh-in imported.'
          : 'You’re up to date. This weigh-in is already saved.',
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sync.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Weight and body measurements">
      <header>
        <div>
          <h2>Measurements</h2>
        </div>
        <div className={styles.inlineActions}>
          {enabled && canManage ? (
            <>
              <button type="button" onClick={onRecord}>
                Record weight
              </button>
              {connection === 'checking' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled
                  aria-busy="true"
                  aria-label="Checking scale connection"
                >
                  <ButtonSpinner /> Checking scale…
                </button>
              )}
              {connection === 'connected' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !canManage}
                  aria-busy={busy}
                  onClick={() => void sync()}
                >
                  {busy ? <ButtonSpinner /> : null}
                  {busy ? 'Syncing…' : 'Sync with VeSync'}
                </button>
              )}
            </>
          ) : canManage ? (
            <Link href="/account/nutrition#weight-tracking">Enable weight tracking</Link>
          ) : (
            <span>Measurements are read only.</span>
          )}
        </div>
      </header>
      {!canManage && <p className={styles.hint}>Measurements are read only for this profile.</p>}
      {latest ? (
        <>
          <div className={styles.currentWeight}>
            <strong>
              {(latest.weightKilograms * (imperial ? 2.2046226218 : 1)).toFixed(1)}{' '}
              <small>{imperial ? 'lb' : 'kg'}</small>
            </strong>
            <span>
              Latest weigh-in ·{' '}
              <time dateTime={latest.measuredAt}>
                {new Date(latest.measuredAt).toLocaleDateString()}
              </time>{' '}
              · {latest.sourceType === 'imported' ? 'Imported' : 'Recorded'}
            </span>
          </div>
          {Object.values(latest.metrics).some((v) => v != null) && (
            <details>
              <summary className="recipe-disclosure-summary">
                Recorded measurements
                <ChevronDown size={18} />
              </summary>
              <p className={styles.hint}>
                Values from this {latest.sourceType === 'imported' ? 'imported' : 'recorded'}{' '}
                observation on {new Date(latest.measuredAt).toLocaleDateString()}.
              </p>
              <dl className={styles.review}>
                {bodyMetricFields
                  .filter((f) => latest.metrics[f.key] != null)
                  .map((f) => (
                    <div key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>
                        {Number(
                          (
                            latest.metrics[f.key]! *
                            (imperial && f.unit === 'kg' ? 2.2046226218 : 1)
                          ).toFixed(1),
                        )}{' '}
                        {imperial && f.unit === 'kg' ? 'lb' : f.unit}
                      </dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
          <BodyCompositionEstimatePanel
            estimate={latest.estimate}
            measuredAt={latest.measuredAt}
            imperial={imperial}
          />
          {!latest.estimate && !Object.values(latest.metrics).some((v) => v != null) && (
            <p>No body composition measurements were included in this weigh-in.</p>
          )}
        </>
      ) : (
        <p>No weigh-ins yet. Add a measurement or connect your scale to start tracking.</p>
      )}
      {connection === 'error' ? (
        <div className={styles.hint} role="status">
          <p>The scale connection could not be checked. This does not mean it is disconnected.</p>
          <button
            type="button"
            onClick={() => {
              setConnection('checking');
              setAttempt((value) => value + 1);
            }}
          >
            Retry connection check
          </button>
          <Link className="inline-link" href="/account/integrations">
            Integration settings
          </Link>
        </div>
      ) : connection === 'checking' ? (
        <p className={styles.hint}>Checking scale connection…</p>
      ) : (
        <p className={styles.hint}>
          {connection === 'connected'
            ? 'Connected. Sync your scale in its app first. '
            : 'No scale connection is configured. '}
          <Link className="inline-link" href="/account/integrations">
            {connection === 'connected' ? 'Manage scale connection' : 'Connect a scale'}
          </Link>
        </p>
      )}
      <Link className="inline-link" href="/nutrition?view=trends">
        View measurement trend
      </Link>
      {message && <ToastMessage message={message} tone="info" />}
    </section>
  );
}
