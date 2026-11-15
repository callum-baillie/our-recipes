'use client';
import { reviewValues } from '../../shared/mobile-domain/proposal-review';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  ClipboardCheck,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { AppActionReview } from '@/lib/services/ai-app-action-service';
import { ActionButton, Callout, CardFooter, CardHead, Disclosure } from './chat-ui/card-parts';
import cards from './chat-ui/cards.module.css';
import styles from './ai-app-action-card.module.css';

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
  const needsFreshReview =
    !images && proposal.actions.some((action) => action.review?.schemaVersion !== 1);
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
        <Callout>Earlier review superseded by your edited proposal.</Callout>
        <AiAppActionCard key={replacement.id} proposal={replacement} />
      </>
    );
  function row(action: AppActionReview['actions'][number], index: number) {
    const image = action.path.endsWith('/images/generate');
    const kind: { Icon: LucideIcon; label: string; tone: string } = image
      ? { Icon: ImagePlus, label: 'Image', tone: 'image' }
      : action.method === 'DELETE'
        ? { Icon: Trash2, label: 'Remove', tone: 'remove' }
        : action.method === 'POST'
          ? { Icon: Plus, label: 'Add', tone: 'add' }
          : { Icon: Pencil, label: 'Update', tone: 'update' };
    const { Icon } = kind;
    return (
      <li key={index} className={styles.row} data-tone={kind.tone}>
        <span className={styles.rowIcon} aria-hidden="true">
          <Icon />
        </span>
        <div className={styles.rowBody}>
          <div className={styles.rowTitle}>
            <strong>
              {action.review?.subject.href ? (
                <Link className="inline-link" href={action.review.subject.href}>
                  {action.review.subject.label}
                </Link>
              ) : action.review ? (
                action.review.subject.label
              ) : action.parameters.recipeId && action.recordLabel ? (
                <Link
                  className="inline-link"
                  href={`/recipes/${encodeURIComponent(action.parameters.recipeId)}`}
                >
                  {action.recordLabel}
                </Link>
              ) : (
                (action.recordLabel ?? 'Saved action')
              )}
            </strong>
            <span className={styles.rowKind}>{kind.label}</span>
          </div>
          {image && !action.recordLabel ? (
            <span className={styles.rowEffect}>
              Recipe title unavailable in this saved proposal.
            </span>
          ) : null}
          <span className={styles.rowEffect}>
            {action.review?.effect ?? action.changeLabel ?? action.summary}
          </span>
          {action.review ? (
            <>
              <dl className={styles.reviewFacts}>
                {action.review.context.map((line, lineIndex) => (
                  <div key={`c${lineIndex}`}>
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
                {action.review.changes.map((change, changeIndex) => (
                  <div key={`d${changeIndex}`} data-change>
                    <dt>{change.label}</dt>
                    <dd>
                      {change.before === undefined ? (
                        change.after
                      ) : (
                        <>
                          <s>{change.before}</s>
                          <ArrowRight aria-hidden="true" />
                          <b>{change.after}</b>
                          <span className={styles.srOnly}>
                            {` (was ${change.before}, now ${change.after})`}
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {action.review.caveats.map((caveat, caveatIndex) => (
                <p className={styles.caveat} key={caveatIndex}>
                  <AlertTriangle aria-hidden="true" /> {caveat}
                </p>
              ))}
            </>
          ) : !image ? (
            <p className={styles.caveat}>
              <AlertTriangle aria-hidden="true" /> Target details are unavailable in this older
              proposal. Ask chat to prepare a fresh review before applying it.
            </p>
          ) : null}
          {!image && action.body != null && (
            <Disclosure summary="Full submitted changes">
              <dl className={styles.reviewFacts}>
                {reviewValues(action.body).map((line, lineIndex) => (
                  <div key={lineIndex}>
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
          )}
          {!!action.bindings?.length && (
            <span className={styles.rowEffect}>
              {action.bindings
                .map(
                  (binding) =>
                    `Uses ${binding.result.split('.')[0]} created in step ${binding.fromStep + 1}`,
                )
                .join(' · ')}
            </span>
          )}
        </div>
      </li>
    );
  }
  const headStatus = status === 'pending' ? 'pending' : status;
  const label = images ? 'images' : 'changes';
  return (
    <section
      className={cards.card}
      aria-label="Review proposed app changes"
      aria-busy={pending !== null}
    >
      <CardHead
        icon={ClipboardCheck}
        eyebrow={status === 'queued' ? 'Background task' : 'Review changes'}
        title={proposal.title}
        subtitle={`${proposal.actions.length} requested ${label}${images && status === 'pending' ? ' · Paid generation' : ''}`}
        status={headStatus}
        statusLabel={status === 'pending' ? 'Needs review' : undefined}
      />
      <ul className={styles.rows}>{proposal.actions.slice(0, 4).map(row)}</ul>
      {proposal.actions.length > 4 && (
        <div className={styles.more}>
          <Disclosure
            summary={`Show ${proposal.actions.length - 4} more ${images ? 'recipes' : 'changes'}`}
          >
            <ul className={styles.rows}>
              {proposal.actions.slice(4).map((action, index) => row(action, index + 4))}
            </ul>
          </Disclosure>
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
            <div className={styles.editorActions}>
              <ActionButton type="submit" tone="primary" pending={editBusy}>
                {editBusy ? 'Preparing…' : 'Prepare edited review'}
              </ActionButton>
              <ActionButton onClick={() => setEditing(false)}>Back to review</ActionButton>
            </div>
          </fieldset>
        </form>
      )}
      {status === 'pending' && !editing && (
        <CardFooter>
          <ActionButton
            tone="primary"
            icon={Check}
            pending={pending === 'apply'}
            disabled={pending !== null || editBusy || needsFreshReview}
            onClick={() => void decide('apply')}
          >
            {pending === 'apply'
              ? 'Starting…'
              : images
                ? `Generate ${proposal.actions.length === 1 ? 'image' : `${proposal.actions.length} images`}`
                : 'Confirm changes'}
          </ActionButton>
          {!images && (
            <ActionButton disabled={pending !== null} onClick={() => setEditing(true)}>
              Edit proposed values
            </ActionButton>
          )}
          <ActionButton
            tone="quiet"
            pending={pending === 'dismiss'}
            disabled={pending !== null}
            onClick={() => void decide('dismiss')}
          >
            {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </ActionButton>
        </CardFooter>
      )}
      <div className={styles.notices}>
        {status === 'running' && (
          <Callout tone="warning">
            This request started. Reload the conversation to check acknowledged results before
            starting another operation.
          </Callout>
        )}
        {status === 'superseded' && (
          <Callout>Superseded by a newer review. Use the current proposal.</Callout>
        )}
        {status === 'queued' && (
          <Callout>
            Queued. You can close the browser; the server will save the results. Follow progress in
            background tasks.
          </Callout>
        )}
        {status === 'partial' && (
          <Callout tone="warning">
            {completed} completed · {failed} failed · {notAttempted} not attempted
            {waiting ? ` · ${waiting} waiting` : ''}
            {unknown ? ` · ${unknown} outcome unknown` : ''}. Inspect the results and source records
            before starting another request.
          </Callout>
        )}
        {status === 'applied' && (
          <Callout tone="success">
            {proposal.actions.length} {images ? 'images saved' : 'changes saved'}.
          </Callout>
        )}
        {!!results.length && status !== 'queued' && (
          <Disclosure summary={`View results (${results.length})`}>
            <ul className={styles.results}>
              {results.map((result, index) => {
                const state = result.ok
                  ? 'Completed'
                  : result.state === 'pending'
                    ? 'Waiting'
                    : result.state === 'not-attempted'
                      ? 'Not attempted'
                      : result.state === 'outcome-unknown'
                        ? 'Outcome unknown'
                        : 'Failed';
                const Icon = result.ok
                  ? Check
                  : result.state === 'pending' || result.state === 'not-attempted'
                    ? Clock3
                    : AlertTriangle;
                return (
                  <li key={index} data-ok={result.ok}>
                    <Icon aria-hidden="true" />
                    <div>
                      <strong>
                        {state}: {result.summary}
                      </strong>
                      <span>{result.message}</span>
                      {result.href && (
                        <Link className="inline-link" href={result.href}>
                          Open affected record
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        )}
        {error && <Callout tone="error">{error}</Callout>}
      </div>
    </section>
  );
}
