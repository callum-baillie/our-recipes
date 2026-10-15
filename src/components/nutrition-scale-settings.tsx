'use client';
import { BodyCompositionEstimatePanel } from './body-composition-estimate';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bodyMetricFields, type BodyMetrics } from '@/lib/domain/body-metrics';
import styles from './nutrition-onboarding-flow.module.css';
export function NutritionScaleSettings({
  profileId,
  metrics,
}: {
  profileId: string;
  metrics: BodyMetrics;
}) {
  const [estimate, setEstimate] = useState<CompositionEstimate | null>(null);
  const [measuredAt, setMeasuredAt] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/nutrition/profiles/${profileId}/scale`, { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          setConnected(data.connected);
          setEstimate(data.compositionEstimate);
          setMeasuredAt(data.measuredAt);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [profileId]);
  async function action(method: 'POST' | 'DELETE') {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${profileId}/scale`, { method });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? 'Unable to update the scale connection.');
      if (method === 'DELETE') {
        setConnected(false);
        setMessage('VeSync disconnected. Saved measurements are retained.');
      } else {
        setEstimate(data.compositionEstimate);
        setMeasuredAt(data.measurement?.measuredAt);
        setMessage(
          data.imported
            ? 'Latest weigh-in added to your weight history.'
            : 'This weigh-in is already in your weight history.',
        );
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sync.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.stack} aria-label="Scale and advanced measurements">
      {Object.values(metrics).some((value) => value != null) ? (
        <details>
          <summary>View saved advanced measurements</summary>
          <dl className={styles.review}>
            {bodyMetricFields
              .filter((field) => metrics[field.key] != null)
              .map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>
                    {metrics[field.key]} {field.unit}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      ) : null}
      <BodyCompositionEstimatePanel estimate={estimate} measuredAt={measuredAt} />
      <Link href="/settings/integrations">Manage connections and automatic sync</Link>
      {connected ? (
        <div>
          <h3>VeSync · Etekcity ESF24</h3>
          <p className={styles.hint}>
            Sync your scale in VeSync first, then import the latest available weigh-in here.
          </p>
          <div className={styles.inlineActions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => void action('POST')}
            >
              {busy ? 'Please wait…' : 'Sync latest weigh-in'}
            </button>
            <button
              className={styles.textButton}
              type="button"
              disabled={busy}
              onClick={() => void action('DELETE')}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
