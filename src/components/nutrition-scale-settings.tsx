'use client';
import { BodyCompositionEstimatePanel } from './body-composition-estimate';
import { ButtonSpinner } from '@/components/skeleton';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bodyMetricFields, type BodyMetrics } from '@/lib/domain/body-metrics';
import styles from './nutrition-onboarding-flow.module.css';
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
}: {
  profileId: string;
  latest: LatestWeighIn | null;
  imperial: boolean;
  onRecord: () => void;
  enabled: boolean;
}) {
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
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
        if (response.ok) setConnected((await response.json()).connected);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setCheckingConnection(false);
      });
    return () => controller.abort();
  }, [profileId]);
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
    <section className="nutrition-measurements" aria-label="Weight and body measurements">
      <header>
        <div>
          <p className="eyebrow">YOUR MEASUREMENTS</p>
          <h2>Weight & body composition</h2>
        </div>
        <div className={styles.inlineActions}>
          {enabled ? (
            <>
              <button type="button" className="primary-button" onClick={onRecord}>
                New weigh-in
              </button>
              {checkingConnection && (
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
              {connected && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void sync()}
                >
                  {busy ? <ButtonSpinner /> : null}
                  {busy ? 'Syncing…' : 'Sync with VeSync'}
                </button>
              )}
            </>
          ) : (
            <Link href="/account/nutrition#weight-tracking">Enable weight tracking</Link>
          )}
        </div>
      </header>
      {latest ? (
        <>
          <div className="nutrition-current-weight">
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
            <dl className={styles.review}>
              {bodyMetricFields
                .filter((f) => latest.metrics[f.key] != null)
                .map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>
                      {Number(
                        (
                          latest.metrics[f.key]! * (imperial && f.unit === 'kg' ? 2.2046226218 : 1)
                        ).toFixed(1),
                      )}{' '}
                      {imperial && f.unit === 'kg' ? 'lb' : f.unit}
                    </dd>
                  </div>
                ))}
            </dl>
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
      <p className={styles.hint}>
        {connected ? 'Sync your scale in the VeSync app first. ' : ''}
        <Link href="/account/integrations">
          {connected ? 'Manage connection and automatic sync' : 'Connect a scale'}
        </Link>
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
