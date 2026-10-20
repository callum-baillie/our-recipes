'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import type { AppActionReview } from '@/lib/services/ai-app-action-service';
import { InlineAlert } from './inline-alert';
import { ButtonSpinner } from './skeleton';
import styles from './ai-app-action-card.module.css';
function ReviewValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Not set</span>;
  if (Array.isArray(value))
    return (
      <ol>
        {value.map((item, index) => (
          <li key={index}>
            <ReviewValue value={item} />
          </li>
        ))}
      </ol>
    );
  if (typeof value === 'object')
    return (
      <dl className={styles.reviewValues}>
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</dt>
            <dd>
              <ReviewValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</span>;
}

export function AiAppActionCard({ proposal }: { proposal: AppActionReview }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<{
    status: string;
    results: NonNullable<AppActionReview['results']>;
    skipped?: number;
  } | null>(null);
  const [pending, setPending] = useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [draftBodies, setDraftBodies] = useState(() =>
    proposal.actions.map((action) => action.body),
  );
  const [replacement, setReplacement] = useState<AppActionReview | null>(null);
  const status =
    proposal.status !== 'pending' ? proposal.status : (outcome?.status ?? proposal.status);
  const results = proposal.results ?? outcome?.results ?? [];
  const completed = results.filter((result) => result.ok).length;
  const failed = results.filter(
    (result) => !result.ok && (!result.state || result.state === 'failed'),
  ).length;
  const unknown = results.filter((result) => result.state === 'outcome-unknown').length;
  const waiting = results.filter((result) => result.state === 'pending').length;
  const notAttempted =
    Math.max(0, proposal.actions.length - results.length) +
    results.filter((result) => result.state === 'not-attempted').length;
  const images = proposal.actions.every((action) => action.path.endsWith('/images/generate'));
  async function decide(decision: 'apply' | 'dismiss') {
    setPending(decision);
    setError('');
    try {
      const response = await fetch('/api/v1/ai/app-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposal.id, version: proposal.version, decision }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Unable to confirm these changes.');
      setOutcome(result);
      window.dispatchEvent(new Event('bord:ai-jobs-changed'));
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to confirm.');
    } finally {
      setPending(null);
    }
  }
  async function saveRevision(event: React.FormEvent) {
    event.preventDefault();
    if (editBusy) return;
    setEditBusy(true);
    setError('');
    try {
      const bodyEdits = draftBodies.flatMap((body, step) =>
        JSON.stringify(body) === JSON.stringify(proposal.actions[step].body)
          ? []
          : [{ step, bodyJson: JSON.stringify(body) }],
      );
      if (!bodyEdits.length) {
        setEditing(false);
        return;
      }
      const response = await fetch('/api/v1/ai/app-actions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: proposal.id,
          version: proposal.version,
          title: proposal.title,
          bodyEdits,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? 'Unable to prepare the edited review.');
      setReplacement(data.appAction);
      setEditing(false);
      window.dispatchEvent(new Event('bord:ai-jobs-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to prepare the edited review.');
    } finally {
      setEditBusy(false);
    }
  }
  if (replacement)
    return (
      <>
        <InlineAlert>Earlier review superseded by your edited proposal.</InlineAlert>
        <AiAppActionCard key={replacement.id} proposal={replacement} />
      </>
    );
  function row(action: AppActionReview['actions'][number], index: number) {
    const image = action.path.endsWith('/images/generate');
    const Icon = image ? ImagePlus : action.method === 'DELETE' ? Trash2 : Pencil;
    return (
      <li key={index} className={styles.row}>
        <Icon size={17} aria-hidden="true" />
        <div>
          <strong>
            {action.parameters.recipeId ? (
              <Link
                className="inline-link"
                href={`/recipes/${encodeURIComponent(action.parameters.recipeId)}`}
              >
                {action.recordLabel ?? action.summary.split('. ')[0]}
              </Link>
            ) : (
              (action.recordLabel ?? action.summary.split('. ')[0])
            )}
          </strong>
          {image && !action.recordLabel ? (
            <span>Recipe title unavailable in this saved proposal.</span>
          ) : null}
          <span>
            {action.changeLabel ??
              (action.method === 'DELETE' ? 'Remove' : action.method === 'POST' ? 'Add' : 'Update')}
          </span>
          {!!action.bindings?.length && (
            <span>
              {action.bindings
                .map(
                  (binding) =>
                    `Uses ${binding.result.split('.')[0]} created in step ${binding.fromStep + 1}`,
                )
                .join(' · ')}
            </span>
          )}
          {!image && (
            <details>
              <summary>Details</summary>
              <ReviewValue value={{ record: action.parameters, changes: action.body }} />
            </details>
          )}
        </div>
      </li>
    );
  }
  return (
    <section
      className={styles.card}
      aria-label="Review proposed app changes"
      aria-busy={pending !== null}
    >
      <header>
        <span className={styles.badge} data-status={status}>
          {status === 'pending'
            ? 'Review changes'
            : status === 'queued'
              ? 'Background task'
              : status}
        </span>
        <h3>{proposal.title}</h3>
        <small>
          {proposal.actions.length} requested {images ? 'images' : 'changes'}
          {images && status === 'pending' ? ' · Paid generation' : ''}
        </small>
      </header>
      <ul className={styles.rows}>{proposal.actions.slice(0, 4).map(row)}</ul>
      {proposal.actions.length > 4 && (
        <details>
          <summary>
            <ChevronRight size={16} aria-hidden="true" /> Show {proposal.actions.length - 4} more{' '}
            {images ? 'recipes' : 'changes'}
          </summary>
          <ul className={styles.rows}>
            {proposal.actions.slice(4).map((action, index) => row(action, index + 4))}
          </ul>
        </details>
      )}
      {status === 'pending' && !editing && (
        <div className={styles.actions}>
          <button
            type="button"
            disabled={pending !== null || editBusy}
            onClick={() => void decide('apply')}
          >
            {pending === 'apply' && <ButtonSpinner />}
            {pending === 'apply'
              ? 'Starting…'
              : images
                ? `Generate ${proposal.actions.length === 1 ? 'image' : `${proposal.actions.length} images`}`
                : 'Confirm changes'}
          </button>
          {!images && (
            <button type="button" disabled={pending !== null} onClick={() => setEditing(true)}>
              Edit proposed values
            </button>
          )}
          <button type="button" disabled={pending !== null} onClick={() => void decide('dismiss')}>
            {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      )}
      {editing && status === 'pending' && (
        <form onSubmit={saveRevision} className={styles.editor}>
          <p>Review changed values before preparing a new proposal.</p>
          <fieldset disabled={editBusy}>
            {draftBodies.map((body, index) => {
              if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
              return (
                <fieldset key={index}>
                  <legend>
                    {index + 1}. {proposal.actions[index].summary}
                  </legend>
                  {Object.entries(body).map(([key, value]) => {
                    if (
                      !['string', 'number', 'boolean'].includes(typeof value) ||
                      /(?:Id$|^expected|^version$|^kind$|^scope$)/u.test(key)
                    )
                      return null;
                    return (
                      <label key={key}>
                        <span>{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                        <input
                          type={
                            typeof value === 'boolean'
                              ? 'checkbox'
                              : typeof value === 'number'
                                ? 'number'
                                : 'text'
                          }
                          {...(typeof value === 'boolean'
                            ? { checked: value }
                            : { value: String(value) })}
                          onChange={(event) => {
                            const next =
                              typeof value === 'boolean'
                                ? event.target.checked
                                : typeof value === 'number' && event.target.value !== ''
                                  ? Number(event.target.value)
                                  : event.target.value;
                            setDraftBodies((current) =>
                              current.map((item, step) =>
                                step === index
                                  ? { ...(item as Record<string, unknown>), [key]: next }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
            <p>
              Nested quantities and structured content remain in Details. Ask the assistant for a
              revised review to change those.
            </p>
            <div className={styles.actions}>
              <button type="submit">Prepare edited review</button>
              <button type="button" onClick={() => setEditing(false)}>
                Back to review
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {status === 'running' && (
        <InlineAlert tone="warning">
          This request started. Reload the conversation to check acknowledged results before
          starting another operation.
        </InlineAlert>
      )}
      {status === 'superseded' && (
        <InlineAlert>Superseded by a newer review. Use the current proposal.</InlineAlert>
      )}
      {status === 'queued' && (
        <InlineAlert>
          Queued. You can close the browser; the server will save the results. Follow progress in
          background tasks.
        </InlineAlert>
      )}
      {status === 'partial' && (
        <InlineAlert tone="warning">
          {completed} completed · {failed} failed · {notAttempted} not attempted
          {waiting ? ` · ${waiting} waiting` : ''}
          {unknown ? ` · ${unknown} outcome unknown` : ''}. Inspect the results and source records
          before starting another request.
        </InlineAlert>
      )}
      {status === 'applied' && (
        <InlineAlert tone="success">
          {proposal.actions.length} {images ? 'images saved' : 'changes saved'}.
        </InlineAlert>
      )}
      {!!results.length && status !== 'queued' && (
        <details>
          <summary>
            <ChevronRight size={16} aria-hidden="true" /> View results ({results.length})
          </summary>
          <ul className={styles.results}>
            {results.map((result, index) => (
              <li key={index}>
                <strong>
                  {result.ok
                    ? 'Completed'
                    : result.state === 'pending'
                      ? 'Waiting'
                      : result.state === 'not-attempted'
                        ? 'Not attempted'
                        : result.state === 'outcome-unknown'
                          ? 'Outcome unknown'
                          : 'Failed'}
                  : {result.summary}
                </strong>
                <span>{result.message}</span>
                {result.href && (
                  <Link className="inline-link" href={result.href}>
                    Open affected record
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
    </section>
  );
}
