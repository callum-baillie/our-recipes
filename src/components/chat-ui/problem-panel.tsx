'use client';
import type { AiChatProblem } from '@/lib/domain/ai-recovery';
import { ErrorDetails } from '../error-details';
export function ChatProblemPanel({
  problem,
  message,
  canManageSettings,
}: {
  problem: AiChatProblem | null;
  message: string;
  canManageSettings: boolean;
}) {
  return (
    <section className="chat-problem" role="alert" aria-label="Assistant error">
      <strong>{problem?.title ?? 'The assistant could not finish'}</strong>
      <p>{problem?.message ?? message}</p>
      {problem?.recoveryRequests.length ? (
        <p>Review the approval cards in this conversation to continue.</p>
      ) : null}
      <ErrorDetails message={problem?.message ?? message} details={problem?.details} />
      <a href={canManageSettings ? '/settings/ai' : '/account/ai'}>
        {canManageSettings ? 'Review AI settings' : 'Review my sharing settings'}
      </a>
    </section>
  );
}
