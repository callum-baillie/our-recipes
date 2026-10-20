'use client';
import { useState } from 'react';
import { InlineAlert } from './inline-alert';
import { ButtonSpinner } from './skeleton';
import styles from './ai-app-action-card.module.css';
export type AiJob = {
  id: string;
  kind: string;
  title: string;
  status: string;
  executionMode: 'direct' | 'batch';
  actionId: string | null;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  errorCode?: string | null;
  items?: {
    id: string;
    recipeId: string | null;
    label: string;
    status: string;
    errorCode: string | null;
    candidateId?: string | null;
  }[];
};
export function isActiveJob(job: AiJob) {
  return ['queued', 'running', 'submitted'].includes(job.status);
}
const errors: Record<string, string> = {
  image_generation_failed: 'The provider could not generate or save this image.',
  recipe_generation_failed: 'The returned recipe could not be saved.',
  batch_item_failed: 'The provider returned an error or an unusable result.',
  batch_expired: 'The provider did not complete this item before the batch expired.',
  batch_failed: 'The provider could not complete the batch.',
  worker_interrupted_review_before_retry:
    'The server restarted before this request finished. Review existing results before retrying.',
  worker_failed: 'The server could not finish this task.',
};
export function AiJobCard({
  job,
  busy = false,
  onCommand,
}: {
  job: AiJob;
  busy?: boolean;
  onCommand?: (id: string, command: 'cancel' | 'retry') => void;
}) {
  const [retryConfirm, setRetryConfirm] = useState(false);
  const active = isActiveJob(job);
  const unfinished = job.totalItems - job.completedItems;
  const failed = ['failed', 'cancelled'].includes(job.status) || job.failedItems > 0;
  return (
    <section className={styles.card} aria-label={`${job.title} background task`}>
      <header>
        <span className={styles.badge}>
          {active ? 'In progress' : failed ? 'Needs attention' : 'Complete'}
        </span>
        <h3>{job.title}</h3>
      </header>
      <InlineAlert tone={active ? 'info' : failed ? 'warning' : 'success'}>
        {active && <ButtonSpinner />} {job.completedItems} of {job.totalItems} completed
        {job.failedItems ? ` · ${job.failedItems} failed` : ''}.
        {active
          ? ` ${job.executionMode === 'batch' ? 'OpenAI Batch may take up to 24 hours. ' : ''}Work continues when you close the browser.`
          : failed
            ? ` ${unfinished} unfinished. ${errors[job.errorCode ?? ''] ?? 'Open details to review the results.'}`
            : job.kind === 'recipe_images'
              ? 'Image previews are ready for review. No photo has been added to a recipe.'
              : 'Draft results are ready to review.'}
      </InlineAlert>
      {!!job.items?.length && (
        <details>
          <summary>View {job.items.length} results</summary>
          <ul className={styles.results}>
            {job.items.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.recipeId ? (
                    <a
                      href={`/recipes/${item.recipeId}${item.candidateId ? `?imageCandidate=${item.candidateId}#recipe-photos` : ''}`}
                    >
                      {item.label}
                    </a>
                  ) : (
                    item.label
                  )}
                </strong>
                <span>
                  {item.status === 'succeeded'
                    ? item.candidateId
                      ? 'Review image preview'
                      : 'Draft ready'
                    : item.status === 'failed'
                      ? (errors[item.errorCode ?? ''] ?? 'Could not complete this item.')
                      : active
                        ? 'Waiting'
                        : 'Not completed'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {onCommand && (
        <div className={styles.actions}>
          {active ? (
            <button type="button" disabled={busy} onClick={() => onCommand(job.id, 'cancel')}>
              {busy ? 'Cancelling…' : 'Cancel task'}
            </button>
          ) : failed && unfinished > 0 ? (
            <button type="button" disabled={busy} onClick={() => setRetryConfirm(true)}>
              Retry unfinished items
            </button>
          ) : null}
        </div>
      )}
      {retryConfirm && (
        <InlineAlert tone="warning">
          Retrying {unfinished} unfinished items may incur new OpenAI charges. Completed items will
          be kept.
          <div className={styles.actions}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onCommand?.(job.id, 'retry');
                setRetryConfirm(false);
              }}
            >
              Confirm paid retry
            </button>
            <button type="button" onClick={() => setRetryConfirm(false)}>
              Keep results
            </button>
          </div>
        </InlineAlert>
      )}
    </section>
  );
}
