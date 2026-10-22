'use client';
import { useState } from 'react';
import type { Equipment } from '@/lib/domain/kitchen';
type Claim = {
  useId: string | null;
  userId: string;
  resourceId: string;
  episodeId: string;
  phaseId: string;
  startedAt: string;
};
export function KitchenClaimsReview({
  items,
  canManage,
  viewerUserId,
  canRecoverAbandoned,
}: {
  items: Equipment[];
  canManage: boolean;
  viewerUserId?: string;
  canRecoverAbandoned: boolean;
}) {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const r = await fetch('/api/v1/kitchen/claims', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message ?? 'Could not read active use.');
      setClaims(body.claims);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setBusy(false);
    }
  }
  async function release(claim: Claim, recovery = false) {
    setBusy(true);
    try {
      const r = await fetch('/api/v1/kitchen/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'release',
          episodeId: claim.episodeId,
          phaseId: claim.phaseId,
          acknowledged: true,
          expectedUseId: claim.useId,
          recoverAbandoned: recovery,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message ?? 'Could not release equipment.');
      setClaims(body.claims);
      setMessage('Acknowledged physical release.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not release.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>Equipment marked in use</h2>
      <p>
        Timers, disconnected devices and cancelled chat turns do not release physical equipment.
        Review abandoned phases here. Only acknowledge release when the appliance and its vessels
        are free.
      </p>
      <button className="secondary-button" disabled={busy} onClick={() => void load()}>
        Review active equipment
      </button>
      <p role="status">{message}</p>
      {claims?.length === 0 && (
        <p>No tracked active phases. Untracked manual cooking is not conflict-verified.</p>
      )}
      {claims &&
        Array.from(new Set(claims.map((c) => `${c.episodeId}:${c.phaseId}`))).map((key) => {
          const group = claims.filter((c) => `${c.episodeId}:${c.phaseId}` === key);
          return (
            <div key={key}>
              <p>
                {group
                  .map(
                    (c) =>
                      items.find((i) => c.resourceId.startsWith(i.id + ':'))?.name ??
                      'Shared resource',
                  )
                  .join(', ')}{' '}
                · Started {new Date(group[0]!.startedAt).toLocaleString()}
              </p>
              {canManage && group[0]!.userId === viewerUserId ? (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void release(group[0]!)}
                >
                  Confirm this phase’s equipment is free
                </button>
              ) : canRecoverAbandoned ? (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void release(group[0]!, true)}
                >
                  Recover abandoned phase after checking equipment is physically free
                </button>
              ) : (
                <p>
                  Ask the person who started this phase, or an administrator reviewing abandoned
                  use, to acknowledge release.
                </p>
              )}
            </div>
          );
        })}
    </section>
  );
}
