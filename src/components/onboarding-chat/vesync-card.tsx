'use client';

import { useRef, useState, type FormEvent } from 'react';

import { BodyCompositionEstimatePanel } from '@/components/body-composition-estimate';
import { ButtonSpinner } from '@/components/skeleton';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';

import { formatWeight, type Answer } from './flow';
import styles from './onboarding-chat.module.css';

type Reading = {
  userId: string;
  userLabel?: string;
  weightKilograms: number;
  measuredAt: string;
  bodyFatPercent?: number;
  compositionEstimate?: CompositionEstimate;
};
type Device = { config: string; name: string; model: string };

async function scaleRequest(payload: Record<string, unknown>) {
  const response = await fetch('/api/v1/setup/vesync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.error?.message ?? 'The scale connection failed. Try again.');
  return result;
}

/**
 * Signs in to VeSync inside the chat. The password lives only in this component's state
 * and is cleared as soon as the request returns; it is never written to the transcript
 * or sent anywhere except the server's VeSync route.
 */
export function VeSyncCard({
  units,
  timeZone,
  onDone,
}: {
  units: 'metric' | 'imperial';
  timeZone: string;
  onDone: (answer: Answer) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('US');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [imported, setImported] = useState<Reading | null>(null);
  const finished = useRef(false);

  async function preview(id: string, config: string) {
    const result = await scaleRequest({ action: 'preview', connectionId: id, config });
    setReadings(result.readings);
    if (!result.readings.length)
      setError('No recent measurements were returned. Sync your scale in VeSync, then try again.');
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setReadings([]);
    try {
      const result = await scaleRequest({ action: 'connect', email, password, country, timeZone });
      setConnectionId(result.connectionId);
      setDevices(result.devices);
      if (result.devices.length === 1) await preview(result.connectionId, result.devices[0].config);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  async function choose(reading: Reading) {
    setBusy(true);
    setError('');
    try {
      const result = await scaleRequest({
        action: 'select',
        connectionId,
        userId: reading.userId,
      });
      setImported(result.reading as Reading);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import this measurement.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (connectionId && !finished.current) {
      setBusy(true);
      try {
        await scaleRequest({ action: 'disconnect', connectionId });
      } catch {
        /* An expired pending connection can still be dropped from the draft. */
      }
    }
    finished.current = true;
    onDone({ kind: 'skip' });
  }

  if (imported && connectionId) {
    return (
      <div className={styles.widget}>
        <p className={styles.widgetTitle}>
          Imported {formatWeight(imported.weightKilograms, units)}
          {imported.bodyFatPercent !== undefined ? ` · ${imported.bodyFatPercent}% body fat` : ''}
        </p>
        <p className={styles.fieldHint}>
          Measured {new Date(imported.measuredAt).toLocaleString()}.
        </p>
        <BodyCompositionEstimatePanel
          estimate={imported.compositionEstimate ?? null}
          measuredAt={imported.measuredAt}
          imperial={units === 'imperial'}
        />
        <button
          className={styles.cta}
          type="button"
          onClick={() => {
            finished.current = true;
            onDone({
              kind: 'vesync',
              weightKilograms: imported.weightKilograms,
              bodyFatPercent: imported.bodyFatPercent,
              measuredAt: imported.measuredAt,
              connectionId,
              label: `Imported ${formatWeight(imported.weightKilograms, units)} from VeSync`,
            });
          }}
        >
          Use this measurement
        </button>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      {!connectionId ? (
        <form className={styles.widgetForm} onSubmit={(event) => void connect(event)}>
          <label className={styles.widgetField}>
            <span>VeSync email</span>
            <input
              className={styles.input}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={styles.widgetField}>
            <span>VeSync password</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className={styles.widgetField}>
            <span>Account country</span>
            <input
              className={styles.input}
              value={country}
              maxLength={2}
              pattern="[A-Za-z]{2}"
              required
              onChange={(event) => setCountry(event.target.value.toUpperCase())}
            />
            <small>Two-letter code, such as US, GB or CA.</small>
          </label>
          <div className={styles.widgetActions}>
            <button className={styles.cta} type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <ButtonSpinner /> : null}
              {busy ? 'Connecting…' : 'Sign in to VeSync'}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => void skip()}
            >
              Enter details instead
            </button>
          </div>
        </form>
      ) : null}

      {devices.length > 1 && !readings.length ? (
        <div className={styles.widgetForm}>
          <p className={styles.widgetTitle}>Which scale?</p>
          {devices.map((device) => (
            <button
              key={device.config}
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await preview(connectionId!, device.config);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'Unable to read scale.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {device.name} · {device.model}
            </button>
          ))}
        </div>
      ) : null}

      {readings.length ? (
        <div className={styles.widgetForm}>
          <p className={styles.widgetTitle}>Which measurement is yours?</p>
          <p className={styles.fieldHint}>
            Other people on the same VeSync account may appear here. Confirm your scale user before
            importing.
          </p>
          {readings.map((reading) => (
            <button
              key={reading.userId}
              className={styles.optionCard}
              type="button"
              disabled={busy}
              onClick={() => void choose(reading)}
            >
              <span className={styles.optionCopy}>
                <strong>{formatWeight(reading.weightKilograms, units)}</strong>
                <small>
                  {reading.userLabel ?? `VeSync user ${reading.userId}`} ·{' '}
                  {new Date(reading.measuredAt).toLocaleString()}
                  {reading.bodyFatPercent !== undefined
                    ? ` · ${reading.bodyFatPercent}% body fat`
                    : ''}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {connectionId && !readings.length && devices.length <= 1 ? (
        <div className={styles.widgetActions}>
          <button className="text-button" type="button" disabled={busy} onClick={() => void skip()}>
            Enter details instead
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
