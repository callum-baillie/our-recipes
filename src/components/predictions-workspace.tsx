'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DecisionAssistance } from './decision-assistance';
import { DECISION_TASKS, type DecisionJob } from '@/lib/domain/decision-assistance';
import styles from './decision-assistance.module.css';
type Record = {
  id: string;
  task: keyof typeof DECISION_TASKS;
  createdAt: string;
  expiresAt: string;
  evidence: unknown;
  correction: { choice: string; status: string; note: string } | null;
  result: {
    job: DecisionJob;
    model?: string;
    choice: string;
    confidence: number | null;
    reason: string;
    probabilities?: { value: string; probability: number }[];
  };
};
export function PredictionsWorkspace() {
  const [loadedAt, setLoadedAt] = useState(0);
  const [records, setRecords] = useState<Record[]>([]);
  const [offset, setOffset] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tripMessage, setTripMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/ai/decisions?history=true&offset=${offset}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.error?.message ?? 'Unable to load prediction history.');
        setRecords(value.records);
        setLoadedAt(Date.now());
        setNext(value.nextOffset);
        setError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, revision]);
  function refresh(page: number) {
    setLoading(true);
    setOffset(page);
    setRevision((value) => value + 1);
  }
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <h1>Predictions</h1>
        <p>
          What might happen next in your kitchen? Explore bold hypotheses about shopping, meal plans
          and nutrition, with the evidence behind each choice.
        </p>
        <p>
          These are forecasts, not facts. Model confidence describes its choice, not a measured
          chance of success. Practical suggestions remain available in{' '}
          <Link href="/assist">Kitchen assistance</Link>.
        </p>
      </header>
      <section className={styles.panel} aria-labelledby="trip-title">
        <h2 id="trip-title">Record a completed shop</h2>
        <p>
          Tell the forecast when you last did a large shop or a top-up. Checking items on a list
          does not automatically count as a completed trip.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setSaving(true);
            setTripMessage('');
            try {
              const response = await fetch('/api/v1/shopping-trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  occurredOn: data.get('occurredOn'),
                  size: data.get('size'),
                  note: data.get('note'),
                }),
              });
              const value = await response.json();
              if (!response.ok) throw new Error(value.error?.message ?? 'Unable to save trip.');
              setTripMessage(
                'Shopping trip recorded. It will be considered in your next shopping forecast.',
              );
              form.reset();
            } catch (error) {
              setTripMessage(error instanceof Error ? error.message : 'Unable to save trip.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className={styles.fields}>
            <label className={styles.field}>
              Date
              <input
                name="occurredOn"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className={styles.field}>
              Shop size
              <select name="size">
                <option value="large">Large shop</option>
                <option value="top_up">Top-up</option>
              </select>
            </label>
            <label className={styles.field}>
              Notes
              <input name="note" maxLength={500} />
            </label>
          </div>
          <button disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Record completed shop'}
          </button>
          <p role="status">{tripMessage}</p>
        </form>
      </section>
      <DecisionAssistance initialTask="next_shop" />
      <section className={styles.workspace} aria-labelledby="prediction-history">
        <div className={styles.actions}>
          <h2 id="prediction-history">Decision & forecast history</h2>
          <button disabled={loading} onClick={() => refresh(0)}>
            Refresh history
          </button>
        </div>
        <p>
          Saved kitchen decisions from pages and chat for this account and active profile, including
          unknown outcomes and corrections. Evidence is the original snapshot; it may now be stale.
          Chat conversations and generated recipe analysis remain in their original workspaces.
        </p>
        {loading ? (
          <p role="status">Loading history…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            {!records.length && (
              <p>No saved predictions yet. Choose a review above to get started.</p>
            )}
            {records.map((row) => {
              const result = row.result;
              const choice = row.correction?.choice ?? result.choice;
              const label = result.job.options.find((o) => o.value === choice)?.label ?? choice;
              return (
                <article key={row.id} className={styles.card}>
                  <small>
                    {DECISION_TASKS[row.task].label} · {new Date(row.createdAt).toLocaleString()}
                  </small>
                  <h3>{result.job.title}</h3>
                  <p>
                    <strong>{label}</strong>{' '}
                    {row.correction
                      ? `· ${row.correction.status}`
                      : result.confidence !== null
                        ? `· model confidence ${Math.round(result.confidence * 100)}%`
                        : ''}
                  </p>
                  <p>{row.correction?.note || result.reason}</p>
                  {new Date(row.expiresAt).getTime() < loadedAt && (
                    <p>Historical result — refresh the review before relying on it.</p>
                  )}
                  <details>
                    <summary>Evidence, alternatives and original analysis</summary>
                    <p>{result.job.instructions}</p>
                    <p>Model: {result.model ?? 'Not recorded in this older result'}</p>
                    {result.probabilities?.map((o) => (
                      <p key={o.value}>
                        {result.job.options.find((option) => option.value === o.value)?.label ??
                          o.value}
                        : {Math.round(o.probability * 100)}%
                      </p>
                    ))}
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {JSON.stringify(
                        {
                          evidence: row.evidence,
                          originalChoice: result.choice,
                          correction: row.correction,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  <Link href={`/assist?task=${row.task}`}>Review current evidence</Link>
                </article>
              );
            })}
          </>
        )}
        <div className={styles.actions}>
          <button
            disabled={loading || offset === 0}
            onClick={() => refresh(Math.max(0, offset - 20))}
          >
            Previous
          </button>
          <button
            disabled={loading || next === null}
            onClick={() => next !== null && refresh(next)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
