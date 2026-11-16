'use client';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { AiRecoveryCard } from '@/lib/domain/ai-recovery';
import { CardHead, CardFooter, ActionButton, Callout } from './card-parts';
import styles from './cards.module.css';
export function AiRecoveryRequestCard({
  request,
  busy,
  onResolve,
  onContinue,
}: {
  request: AiRecoveryCard;
  busy: boolean;
  onResolve: (id: string, decision: 'once' | 'permanent' | 'decline' | 'revoke') => void;
  onContinue: (request: AiRecoveryCard) => void;
}) {
  return (
    <section className={styles.card} aria-label="Assistant approval request">
      <CardHead
        icon={request.kind === 'sharing' ? ShieldCheck : SlidersHorizontal}
        eyebrow={request.kind === 'sharing' ? 'Permission request' : 'Administrator approval'}
        title={request.title}
        status={
          request.status === 'pending'
            ? 'pending'
            : request.status === 'approved'
              ? 'confirmed'
              : request.status === 'used'
                ? 'completed'
                : 'cancelled'
        }
      />
      <div className={styles.body}>
        <p>{request.reason}</p>
        <p>
          <strong>{request.scope}</strong>
        </p>
        <Callout tone="info">{request.approvalNote}</Callout>
        {request.canApprove ? (
          <>
            <p>
              Allow once applies to one reply in this conversation, not queued background work. The
              request expires 15 minutes after it was created. Later replies that need the same
              private context may ask for approval again. The assistant cannot approve its own
              request.
            </p>
            <p>{request.permanentNote}</p>
          </>
        ) : null}
        {request.status === 'used' ? (
          <p>
            {request.approvedMode === 'once'
              ? 'One-time approval used for one reply. No permanent setting was changed.'
              : 'Setting updated and this request completed.'}
          </p>
        ) : null}
        {request.status === 'expired' ? <p>This request expired. Ask for a new approval.</p> : null}
        {request.status === 'declined' ? (
          <p>
            {request.approvedMode === 'once'
              ? 'One-time access was revoked. Further use is blocked; earlier replies remain available.'
              : 'Not approved. Your settings were not changed.'}
          </p>
        ) : null}
      </div>
      <CardFooter note="Approval does not run the task. The requester must review any existing drafts before continuing.">
        {request.canApprove ? (
          <>
            <ActionButton
              disabled={busy}
              pending={busy}
              tone="primary"
              onClick={() => onResolve(request.id, 'once')}
            >
              Allow once
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => onResolve(request.id, 'permanent')}>
              {request.kind === 'sharing' ? 'Always allow' : 'Update setting'}
            </ActionButton>
            <ActionButton
              disabled={busy}
              tone="quiet"
              onClick={() => onResolve(request.id, 'decline')}
            >
              Not now
            </ActionButton>
          </>
        ) : null}
        {request.canRevoke ? (
          <ActionButton
            disabled={busy}
            tone="quiet"
            onClick={() => onResolve(request.id, 'revoke')}
          >
            Revoke one-time access
          </ActionButton>
        ) : null}
        {request.canContinue ? (
          <ActionButton disabled={busy} tone="primary" onClick={() => onContinue(request)}>
            Continue request
          </ActionButton>
        ) : null}
      </CardFooter>
    </section>
  );
}
