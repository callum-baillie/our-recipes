'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import styles from '@/components/nutrition-prepared-workspace.module.css';

export type PreparedServingWorkspace = Array<{
  id: string;
  recipeNameSnapshot: string;
  actualServings: number;
  finalWeightGrams: number | null;
  calculationAlignment: 'as_calculated' | 'requires_recalculation';
  note: string;
  assignedServings: number;
  remainingServings: number;
  overallocatedServings: number;
  confidence: number;
  completeness: number;
  ownAllocations: Array<{
    id: string;
    seriesId: string;
    revision: number;
    state: 'planned' | 'served' | 'eaten' | 'skipped' | 'leftover';
    servings: number | null;
    portionWeightGrams: number | null;
    intakeSeriesId: string | null;
    note: string;
  }>;
}>;

function createKeys(items: PreparedServingWorkspace, prefix: string) {
  return Object.fromEntries(items.map((item) => [`${prefix}:${item.id}`, crypto.randomUUID()]));
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? 'The prepared portion could not be saved.';
}

export function NutritionPreparedWorkspace({
  activeProfileId,
  activeProfileName,
  canManageProfile,
  workspace,
}: {
  activeProfileId: string;
  activeProfileName: string;
  canManageProfile: boolean;
  workspace: PreparedServingWorkspace;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [commandKeys, setCommandKeys] = useState<Record<string, string>>(() => ({
    ...createKeys(workspace, 'eat'),
    ...createKeys(workspace, 'serve'),
    ...Object.fromEntries(
      workspace.flatMap((item) =>
        item.ownAllocations.flatMap((allocation) => [
          [`eat:${allocation.id}`, crypto.randomUUID()],
          [`state:${allocation.id}`, crypto.randomUUID()],
        ]),
      ),
    ),
  }));
  const [localNow] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
  );

  function stableKey(key: string) {
    return commandKeys[key] ?? crypto.randomUUID();
  }

  function rotateKey(key: string) {
    setCommandKeys((current) => ({ ...current, [key]: crypto.randomUUID() }));
  }

  async function confirmEaten(
    event: FormEvent<HTMLFormElement>,
    preparedId: string,
    allocation: PreparedServingWorkspace[number]['ownAllocations'][number] | null,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const portionBasis = data.get('portionBasis');
    const servingCount = Number(data.get('servingCount'));
    const portionWeightGrams = Number(data.get('portionWeightGrams'));
    const keyName = allocation ? `eat:${allocation.id}` : `eat:${preparedId}`;
    setStatus('Confirming eaten portion…');
    const response = await fetch(
      `/api/v1/nutrition/profiles/${activeProfileId}/prepared-recipes/${preparedId}/consume`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: stableKey(keyName),
          servingCount: portionBasis === 'servings' ? servingCount : null,
          portionWeightGrams: portionBasis === 'weight' ? portionWeightGrams : null,
          occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
          mealSlot: data.get('mealSlot'),
          allocationSeriesId: allocation?.seriesId,
          supersedesAllocationVersionId: allocation?.id ?? null,
          note: data.get('note'),
        }),
      },
    );
    if (!response.ok) {
      setStatus(await responseError(response));
      return;
    }
    rotateKey(keyName);
    setStatus('Eaten portion confirmed with an immutable Nutrition snapshot.');
    router.refresh();
  }

  function remainingWeight(prepared: PreparedServingWorkspace[number]) {
    return prepared.finalWeightGrams
      ? (prepared.remainingServings / prepared.actualServings) * prepared.finalWeightGrams
      : null;
  }

  async function recordState(
    event: FormEvent<HTMLFormElement>,
    preparedId: string,
    allocation: PreparedServingWorkspace[number]['ownAllocations'][number] | null,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const keyName = allocation ? `state:${allocation.id}` : `serve:${preparedId}`;
    const allocationSeriesId = allocation?.seriesId ?? stableKey(keyName);
    setStatus('Saving prepared portion state…');
    const response = await fetch(
      `/api/v1/nutrition/profiles/${activeProfileId}/prepared-recipes/${preparedId}/allocations`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          allocationSeriesId,
          supersedesAllocationVersionId: allocation?.id ?? null,
          state: data.get('state'),
          servingCount: Number(data.get('servingCount')),
          note: data.get('note'),
        }),
      },
    );
    if (!response.ok) {
      setStatus(await responseError(response));
      return;
    }
    rotateKey(keyName);
    setStatus('Prepared portion state saved. No food was recorded as eaten.');
    router.refresh();
  }

  return (
    <section className={styles.panel} aria-labelledby="prepared-serving-heading">
      <header>
        <div>
          <h2 id="prepared-serving-heading">Prepared servings</h2>
          <p>
            Serving, skipping, and saving leftovers are not consumption. Only “Confirm eaten” adds
            an immutable Food Diary entry.
          </p>
        </div>
      </header>
      {workspace.length === 0 ? (
        <p className={styles.empty}>
          No prepared batches yet. Record one from a current planned meal in Overview.
        </p>
      ) : (
        <ol className={styles.batches}>
          {workspace.map((prepared) => (
            <li key={prepared.id}>
              <header>
                <div>
                  <h3>{prepared.recipeNameSnapshot}</h3>
                  <p>
                    {prepared.assignedServings} assigned · {prepared.remainingServings} remaining of{' '}
                    {prepared.actualServings}
                  </p>
                </div>
                <span>
                  {Math.round(prepared.completeness * 100)}% complete ·{' '}
                  {Math.round(prepared.confidence * 100)}% confidence
                </span>
              </header>
              {prepared.calculationAlignment !== 'as_calculated' ? (
                <p className={styles.warning}>
                  Preparation changes need a matching recalculation before any portion can be
                  recorded as eaten.
                </p>
              ) : null}
              {prepared.overallocatedServings > 0 ? (
                <p className={styles.warning}>
                  Existing allocation history exceeds the recorded yield by{' '}
                  {prepared.overallocatedServings} servings.
                </p>
              ) : null}

              <div className={styles.allocations}>
                {prepared.ownAllocations.map((allocation) => (
                  <article key={allocation.seriesId}>
                    <strong>
                      {activeProfileName}:{' '}
                      {allocation.portionWeightGrams
                        ? `${allocation.portionWeightGrams} g (${allocation.servings} serving equivalent)`
                        : `${allocation.servings} serving${allocation.servings === 1 ? '' : 's'}`}{' '}
                      · {allocation.state}
                    </strong>
                    <small>Revision {allocation.revision}</small>
                    {allocation.state !== 'eaten' ? (
                      <>
                        <form
                          onSubmit={(event) => void recordState(event, prepared.id, allocation)}
                        >
                          <label>
                            Update state
                            <select
                              name="state"
                              defaultValue={
                                allocation.state === 'planned' ? 'served' : allocation.state
                              }
                            >
                              <option value="served">Served, not yet eaten</option>
                              <option value="skipped">Skipped</option>
                              <option value="leftover">Leftover, not eaten</option>
                            </select>
                          </label>
                          <label>
                            Servings
                            <input
                              name="servingCount"
                              type="number"
                              min="0.000001"
                              step="any"
                              defaultValue={allocation.servings ?? 1}
                              required
                            />
                          </label>
                          <label>
                            Note
                            <input name="note" maxLength={500} defaultValue={allocation.note} />
                          </label>
                          <button type="submit" disabled={!canManageProfile}>
                            Save state revision
                          </button>
                        </form>
                        {prepared.calculationAlignment === 'as_calculated' ? (
                          <form
                            onSubmit={(event) => void confirmEaten(event, prepared.id, allocation)}
                          >
                            <strong>Confirm this portion was eaten</strong>
                            <label>
                              Portion basis
                              <select
                                name="portionBasis"
                                defaultValue={allocation.portionWeightGrams ? 'weight' : 'servings'}
                              >
                                <option value="servings">Serving count</option>
                                {prepared.finalWeightGrams ? (
                                  <option value="weight">Weighed portion in grams</option>
                                ) : null}
                              </select>
                            </label>
                            <label>
                              Servings eaten
                              <input
                                name="servingCount"
                                type="number"
                                min="0.000001"
                                step="any"
                                defaultValue={allocation.servings ?? 1}
                              />
                            </label>
                            {prepared.finalWeightGrams ? (
                              <label>
                                Portion weight in grams
                                <input
                                  name="portionWeightGrams"
                                  type="number"
                                  min="0.000001"
                                  max={prepared.finalWeightGrams}
                                  step="any"
                                  defaultValue={allocation.portionWeightGrams ?? undefined}
                                />
                              </label>
                            ) : null}
                            <label>
                              When
                              <input
                                name="occurredAt"
                                type="datetime-local"
                                defaultValue={localNow}
                                suppressHydrationWarning
                                required
                              />
                            </label>
                            <label>
                              Meal
                              <select name="mealSlot" defaultValue="dinner">
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                            <label>
                              Note
                              <input name="note" maxLength={500} />
                            </label>
                            <button type="submit" disabled={!canManageProfile}>
                              Confirm eaten
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <p className={styles.confirmed}>
                        Recorded in Food Diary. Use diary correction history to change it.
                      </p>
                    )}
                  </article>
                ))}
              </div>

              {prepared.remainingServings > 0 ? (
                <div className={styles.newPortion}>
                  <form onSubmit={(event) => void recordState(event, prepared.id, null)}>
                    <strong>Set aside another portion</strong>
                    <label>
                      State
                      <select name="state" defaultValue="served">
                        <option value="served">Served, not yet eaten</option>
                        <option value="leftover">Leftover, not eaten</option>
                      </select>
                    </label>
                    <label>
                      Servings
                      <input
                        name="servingCount"
                        type="number"
                        min="0.000001"
                        max={prepared.remainingServings}
                        step="any"
                        defaultValue={Math.min(1, prepared.remainingServings)}
                        required
                      />
                    </label>
                    <label>
                      Note
                      <input name="note" maxLength={500} />
                    </label>
                    <button type="submit" disabled={!canManageProfile}>
                      Save portion
                    </button>
                  </form>
                  {prepared.calculationAlignment === 'as_calculated' ? (
                    <form onSubmit={(event) => void confirmEaten(event, prepared.id, null)}>
                      <strong>Confirm another portion eaten</strong>
                      <label>
                        Portion basis
                        <select name="portionBasis" defaultValue="servings">
                          <option value="servings">Serving count</option>
                          {prepared.finalWeightGrams ? (
                            <option value="weight">Weighed portion in grams</option>
                          ) : null}
                        </select>
                      </label>
                      <label>
                        Servings eaten
                        <input
                          name="servingCount"
                          type="number"
                          min="0.000001"
                          max={prepared.remainingServings}
                          step="any"
                          defaultValue={Math.min(1, prepared.remainingServings)}
                        />
                      </label>
                      {remainingWeight(prepared) ? (
                        <label>
                          Portion weight in grams
                          <input
                            name="portionWeightGrams"
                            type="number"
                            min="0.000001"
                            max={remainingWeight(prepared)!}
                            step="any"
                            defaultValue={Math.min(
                              remainingWeight(prepared)!,
                              prepared.finalWeightGrams! / prepared.actualServings,
                            )}
                          />
                        </label>
                      ) : null}
                      <label>
                        When
                        <input
                          name="occurredAt"
                          type="datetime-local"
                          defaultValue={localNow}
                          suppressHydrationWarning
                          required
                        />
                      </label>
                      <label>
                        Meal
                        <select name="mealSlot" defaultValue="dinner">
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        Note
                        <input name="note" maxLength={500} />
                      </label>
                      <button type="submit" disabled={!canManageProfile}>
                        Confirm eaten
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
