'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppActionReview } from '@/lib/services/ai-app-action-service';
import styles from './decision-assistance.module.css';
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
  const [status, setStatus] = useState(proposal.status);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function decide(decision: 'apply' | 'dismiss') {
    setPending(true);
    try {
      const response = await fetch('/api/v1/ai/app-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposal.id, version: proposal.version, decision }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Unable to confirm these changes.');
      setStatus(result.status);
      setMessage(
        result.results
          .map((r: { summary: string; message: string }) => `${r.summary}: ${r.message}`)
          .join(' ') + (result.skipped ? ` ${result.skipped} later actions were skipped.` : ''),
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to confirm.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={styles.card} aria-label="Review proposed app changes">
      <span className={styles.badge}>{status === 'pending' ? 'Review before saving' : status}</span>
      <h3>{proposal.title}</h3>
      <p>
        {proposal.actions.length} {proposal.actions.length === 1 ? 'change' : 'changes'}. Check the
        affected records and values below.
      </p>
      {proposal.actions.map((action, index) => (
        <details key={index} open={proposal.actions.length === 1}>
          <summary>
            {index + 1}. {action.summary}
            {action.method === 'DELETE' ? ' — delete' : ''}
          </summary>
          <div className={styles.evidence}>
            <ReviewValue value={{ record: action.parameters, changes: action.body }} />
          </div>
        </details>
      ))}
      {status === 'pending' && (
        <div className={styles.actions}>
          <button className={styles.primary} disabled={pending} onClick={() => decide('apply')}>
            {pending
              ? 'Saving…'
              : `Confirm ${proposal.actions.length === 1 ? 'change' : 'selected batch'}`}
          </button>
          <button disabled={pending} onClick={() => decide('dismiss')}>
            Dismiss
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
