'use client';
import styles from './cooking-mode.module.css';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { RecipeDetail } from '@/lib/services/recipe-service';
import {
  kitchenPhaseSchema,
  kitchenPlanRequestSchema,
  type KitchenPlan,
  type KitchenState,
} from '@/lib/domain/kitchen';
export function RecipeKitchenCheck({
  recipe,
  mealPlanEntryId,
  episodeId,
  sessionRevision,
  contextRevision,
  targetServings,
  immersive,
}: {
  recipe: RecipeDetail;
  mealPlanEntryId?: string;
  episodeId?: string | null;
  sessionRevision?: number;
  contextRevision?: number;
  targetServings?: number;
  immersive?: boolean;
}) {
  const acceptIntentId = useRef(createClientUuid());
  const [plan, setPlan] = useState<KitchenPlan | null>(null);
  const [kitchen, setKitchen] = useState<KitchenState | null>(null);
  const [message, setMessage] = useState('');
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewedRequest, setReviewedRequest] = useState<unknown>(null);
  const [activePhases, setActivePhases] = useState<string[]>([]);
  const [useIds, setUseIds] = useState<Record<string, string>>({});
  async function check() {
    setBusy(true);
    setMessage('');
    setAcceptedId(null);
    try {
      const r = await fetch('/api/v1/kitchen', { cache: 'no-store' });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error?.message ?? 'Could not read your kitchen.');
      setKitchen(result.kitchen);
      if (!recipe.equipmentRequirements.length) {
        setPlan(null);
        setMessage(
          'This recipe has no reviewed structured requirements. Equipment text alone cannot verify capacity, fit or conflicts. Manual cooking remains available.',
        );
        return;
      }
      const mealResponse = mealPlanEntryId
        ? await fetch(`/api/v1/meal-plan/${mealPlanEntryId}`, { cache: 'no-store' })
        : null;
      const meal = mealResponse?.ok ? (await mealResponse.json()).meal : null;
      const phases = recipe.equipmentRequirements.map((req, index) =>
        kitchenPhaseSchema.parse({
          id: `requirement-${index + 1}`,
          recipeId: recipe.id,
          recipeRevision: recipe.currentRevision,
          targetServings,
          ...(episodeId && sessionRevision
            ? { cookSessionId: episodeId, cookSessionRevision: sessionRevision }
            : {}),
          ...(mealPlanEntryId ? { mealPlanEntryId, mealExpectedUpdatedAt: meal?.updatedAt } : {}),
          stepRefs: req.steps
            .map((ref) => recipe.instructionSections[ref.section]?.steps[ref.step]?.id)
            .filter(Boolean),
          capability: req.capability,
          quantity: req.quantity,
          amount: req.amount,
          cavityLoad: req.cavityLoad,
          temperatureC: req.temperatureC,
          mode: req.mode,
          capacityReviewRequired: req.capacityReviewRequired,
          durationMinutes: Math.max(
            1,
            recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes,
          ),
          needsVessel: req.capability.startsWith('heat-'),
          vesselCapability: req.vesselCapability,
        }),
      );
      const requestBody = {
        expectedRevision: result.kitchen.revision,
        ...(episodeId ? { episodeId, episodeContextRevision: contextRevision } : {}),
        phases,
        strategy: 'parallel',
      };
      const response = await fetch('/api/v1/kitchen/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not check kitchen.');
      setPlan(body.plan);
      setReviewedRequest(requestBody);
      acceptIntentId.current = createClientUuid();
      if (episodeId) {
        const savedResponse = await fetch(`/api/v1/cook-sessions/${episodeId}/context`, {
          cache: 'no-store',
        });
        if (savedResponse.ok) {
          const saved = await savedResponse.json();
          if (
            saved.acceptedPlanState === 'compatible' &&
            JSON.stringify(saved.acceptedPlan?.request) ===
              JSON.stringify(kitchenPlanRequestSchema.parse(requestBody))
          ) {
            setAcceptedId(saved.acceptedPlan.id);
            setMessage(
              'Your saved equipment plan still matches this cooking episode. Start only the phase you are actually using.',
            );
          } else if (saved.acceptedPlan)
            setMessage(
              'A saved allocation needs a refreshed review. Accept the current plan before starting.',
            );
        }
        const active = await fetch('/api/v1/kitchen/claims', { cache: 'no-store' });
        if (active.ok) {
          const claims = (await active.json()).claims.filter(
            (c: { episodeId: string }) => c.episodeId === episodeId,
          );
          setActivePhases(claims.map((c: { phaseId: string }) => c.phaseId));
          setUseIds(
            Object.fromEntries(
              claims.map((c: { phaseId: string; useId: string }) => [c.phaseId, c.useId]),
            ),
          );
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not check your kitchen.');
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    setBusy(true);
    setMessage('');
    try {
      const operationId = acceptIntentId.current;
      const response = await fetch(`/api/v1/cook-sessions/${episodeId}/context`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'accept-plan',
          operationId,
          expectedContextRevision: contextRevision,
          plan: reviewedRequest,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not accept this plan.');
      setAcceptedId(body.acceptedPlan.id);
      setMessage(
        'Plan saved for this cooking episode. Equipment is claimed only when you start a phase.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not accept this plan.');
    } finally {
      setBusy(false);
    }
  }
  async function track(phaseId: string, release = false) {
    setBusy(true);
    try {
      const r = await fetch('/api/v1/kitchen/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: release ? 'release' : 'start',
          episodeId,
          phaseId,
          ...(release
            ? { acknowledged: true, expectedUseId: useIds[phaseId] }
            : acceptedId
              ? { acceptedPlanId: acceptedId }
              : { plan: reviewedRequest }),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message ?? 'Unable to update tracked use.');
      setActivePhases(
        body.claims
          .filter((c: { episodeId: string }) => c.episodeId === episodeId)
          .map((c: { phaseId: string }) => c.phaseId),
      );
      setUseIds(
        Object.fromEntries(
          body.claims
            .filter((c: { episodeId: string }) => c.episodeId === episodeId)
            .map((c: { phaseId: string; useId: string }) => [c.phaseId, c.useId]),
        ),
      );
      setMessage(
        release
          ? 'Physical release acknowledged.'
          : body.phaseState === 'released'
            ? 'This use was already released. Prepare a new reviewed plan for an explicit repeat.'
            : 'This phase is marked in use until you acknowledge release.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to update.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={immersive ? `cooking-pantry ${styles.episodePanel}` : 'settings-card'}>
      <h2>Check your kitchen</h2>
      <p>
        Uses recorded physical equipment. Capacity, fit and full-meal timing need explicit
        requirements. Changing servings requires a new capacity review.
      </p>
      <button className="secondary-button" disabled={busy} onClick={() => void check()}>
        Check recorded equipment
      </button>
      <p role="status">{message}</p>
      {plan && (
        <>
          <p>
            {plan.status === 'compatible'
              ? 'Compatible under the recorded constraints'
              : plan.status === 'needs-information'
                ? 'Check size or capability'
                : 'Equipment conflict: review another item or sequence'}
          </p>
          {episodeId && plan.status === 'compatible' && !acceptedId && (
            <button className="primary-button" disabled={busy} onClick={() => void accept()}>
              Accept equipment plan
            </button>
          )}
          <ul>
            {plan.assignments.map((a) => (
              <li key={a.phaseId}>
                {a.resourceIds
                  .map(
                    (id) =>
                      kitchen?.items.find((i) => id.startsWith(i.id + ':'))?.name ??
                      'Shared constraint',
                  )
                  .join(' + ')}
                {episodeId && kitchen?.canManage && plan.status === 'compatible' && (
                  <button
                    className="secondary-button"
                    disabled={busy || (!acceptedId && !activePhases.includes(a.phaseId))}
                    onClick={() => void track(a.phaseId, activePhases.includes(a.phaseId))}
                  >
                    {activePhases.includes(a.phaseId)
                      ? 'Confirm phase equipment is physically free'
                      : 'Start tracking this phase'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <ul>
            {plan.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p>{plan.assumptions.join(' ')}</p>
        </>
      )}
      <Link href="/my-kitchen">Review My Kitchen</Link>
    </section>
  );
}
