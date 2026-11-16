'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AiRecoveryCard } from '@/lib/domain/ai-recovery';
import { AiRecoveryRequestCard } from './chat-ui/recovery-card';
import { useToast } from './toast-provider';
export function AiApprovalInbox() {
  const [requests, setRequests] = useState<AiRecoveryCard[]>([]);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const load = useCallback(async () => {
    const r = await fetch('/api/v1/ai/recovery', { cache: 'no-store' });
    if (r.ok) {
      const body = await r.json();
      if (Array.isArray(body.requests))
        setRequests(body.requests.filter((r: AiRecoveryCard) => r.canApprove || r.canRevoke));
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load().catch(() => {}), 0);
    const t = setInterval(() => void load().catch(() => {}), 10000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  async function resolve(id: string, decision: 'once' | 'permanent' | 'decline' | 'revoke') {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/ai/recovery/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok)
        throw new Error((await r.json()).error?.message ?? 'Could not review this approval.');
      await load();
      showToast(
        decision === 'revoke'
          ? 'One-time access revoked.'
          : decision === 'decline'
            ? 'Request declined.'
            : 'Approval saved. The requester can continue from their conversation.',
        'success',
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not review the request.', 'error');
    } finally {
      setBusy(false);
    }
  }
  if (!requests.length) return null;
  return (
    <section id="ai-approvals" aria-label="AI approval inbox">
      <h2>Requests for your approval</h2>
      <p>
        Other household conversations may need your consent. Review exactly what will be shared.
      </p>
      {requests.map((request) => (
        <AiRecoveryRequestCard
          key={request.id}
          request={request}
          busy={busy}
          onResolve={(id, d) => void resolve(id, d)}
          onContinue={() => {}}
        />
      ))}
    </section>
  );
}
