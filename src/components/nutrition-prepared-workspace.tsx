'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { createClientUuid } from '@/lib/client/client-uuid';
import { nutritionEventInstant, nutritionWallTime } from '@/lib/domain/nutrition-ui';
import { useNutritionDraft } from './use-nutrition-draft';
import { useNutritionRequest } from './use-nutrition-request';
import { NutritionEventFields, NutritionFeedback } from './nutrition-form-fields';
import formStyles from './nutrition-dashboard.module.css';
import styles from './nutrition-prepared-workspace.module.css';
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

type Prepared = PreparedServingWorkspace[number];
type Allocation = Prepared['ownAllocations'][number];
type Context = {
  profileId: string;
  profileName: string;
  canManage: boolean;
  date: string;
  today: string;
  timeZone: string;
};
export function NutritionPreparedWorkspace({
  activeProfileId,
  activeProfileName,
  canManageProfile,
  workspace,
  date,
  today,
  timeZone = 'UTC',
  onLog,
}: {
  activeProfileId: string;
  activeProfileName: string;
  canManageProfile: boolean;
  workspace: PreparedServingWorkspace;
  date?: string;
  today?: string;
  timeZone?: string;
  onLog?: () => void;
}) {
  const currentDay = today ?? nutritionWallTime(new Date(), timeZone).slice(0, 10);
  const context = {
    profileId: activeProfileId,
    profileName: activeProfileName,
    canManage: canManageProfile,
    date: date ?? currentDay,
    today: currentDay,
    timeZone,
  };
  return (
    <section className={styles.panel} aria-label="Prepared servings">
      <header>
        <h2>Prepared servings</h2>
        <p>
          Inventory includes saved batches from any date. Choose the receiving person, portion and
          event date before confirming eaten; serving or saving leftovers does not add diary
          nutrients.
        </p>
      </header>
      {!workspace.length ? (
        <div className={styles.empty}>
          <p>
            No prepared batches yet. Start with an eligible planned recipe and its current
            calculation.
          </p>
          <Link className="inline-link" href="/nutrition?view=overview&portions=1#planned-portions">
            View planned meals
          </Link>
          {onLog && (
            <button type="button" onClick={onLog} disabled={!canManageProfile}>
              Log an unplanned recipe portion
            </button>
          )}
        </div>
      ) : (
        <ol className={styles.batches}>
          {workspace.map((prepared) => (
            <PreparedBatch
              key={`${activeProfileId}:${prepared.id}`}
              prepared={prepared}
              {...context}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
function PreparedBatch({ prepared, ...context }: Context & { prepared: Prepared }) {
  const request = useNutritionRequest(
    `${context.profileId}:prepared:${prepared.id}:${context.date}`,
  );
  const forms = (allocation: Allocation | null) => {
    const key = allocation?.seriesId ?? 'new';
    return (
      <div className={styles.portionTasks}>
        {allocation?.state === 'eaten' ? (
          <div className={styles.confirmed}>
            <p>
              {context.profileName}: this portion is recorded in the Food Diary. Correct consumption
              there.
            </p>
            <Link className="inline-link" href="/nutrition?view=diary">
              Find consumed entry in diary
            </Link>
            <NutritionFeedback value={request.feedback[`consume:${key}`]} />
          </div>
        ) : (
          <>
            <details>
              <summary className="recipe-disclosure-summary">
                {allocation ? 'Update saved portion state' : 'Set aside a portion'}
                <ChevronDown size={18} />
              </summary>
              <PreparedTaskForm
                key={`${key}:state:${context.date}`}
                {...context}
                prepared={prepared}
                allocation={allocation}
                mode="state"
                request={request}
              />
            </details>
            {prepared.calculationAlignment === 'as_calculated' && (
              <details>
                <summary className="recipe-disclosure-summary">
                  {allocation ? 'Confirm this portion was eaten' : 'Confirm another portion eaten'}
                  <ChevronDown size={18} />
                </summary>
                <PreparedTaskForm
                  key={`${key}:consume:${context.date}`}
                  {...context}
                  prepared={prepared}
                  allocation={allocation}
                  mode="consume"
                  request={request}
                />
              </details>
            )}
          </>
        )}
      </div>
    );
  };
  return (
    <li>
      <header>
        <h3>{prepared.recipeNameSnapshot}</h3>
        <p>
          Shared prepared yield: {prepared.actualServings} servings · {prepared.assignedServings}{' '}
          assigned · {prepared.remainingServings} unassigned capacity
        </p>
      </header>
      <p className={styles.helper}>
        Unassigned capacity is separate from physically uneaten leftovers. Nutrition evidence:{' '}
        {Math.round(prepared.completeness * 100)}% complete ·{' '}
        {Math.round(prepared.confidence * 100)}% confidence.
      </p>
      {prepared.calculationAlignment !== 'as_calculated' && (
        <p className={styles.warning}>
          Preparation changes need matching calculation evidence before consumption can be recorded.
          Saved portion states remain available.
        </p>
      )}
      {prepared.overallocatedServings > 0 && (
        <p className={styles.warning}>
          Saved allocation history exceeds this batch’s yield by {prepared.overallocatedServings}{' '}
          servings. Resolve capacity before assigning more.
        </p>
      )}
      <div className={styles.allocations}>
        {prepared.ownAllocations.map((allocation) => (
          <article key={allocation.seriesId}>
            <strong>
              {context.profileName} ·{' '}
              {allocation.portionWeightGrams != null
                ? `${allocation.portionWeightGrams} g (${allocation.servings ?? 'unknown'} serving equivalent)`
                : `${allocation.servings ?? 'Unknown'} servings`}{' '}
              · {allocation.state}
            </strong>
            <small>Revision {allocation.revision}</small>
            {forms(allocation)}
          </article>
        ))}
      </div>
      {prepared.remainingServings > 0 && <div className={styles.newPortion}>{forms(null)}</div>}
      {prepared.remainingServings <= 0 && (
        <>
          <NutritionFeedback value={request.feedback['consume:new']} />
          <NutritionFeedback value={request.feedback['state:new']} />
        </>
      )}
      {!context.canManage && (
        <p className={styles.helper}>Prepared portions are read only for this profile.</p>
      )}
    </li>
  );
}
function PreparedTaskForm({
  prepared,
  allocation,
  mode,
  request,
  ...context
}: Context & {
  prepared: Prepared;
  allocation: Allocation | null;
  mode: 'state' | 'consume';
  request: ReturnType<typeof useNutritionRequest>;
}) {
  const router = useRouter();
  const task = `${mode}:${allocation?.seriesId ?? 'new'}`;
  const defaultServings = allocation?.servings ?? Math.min(1, prepared.remainingServings);
  const { draft, update, clear, notice, dirty } = useNutritionDraft(
    `${context.profileId}:prepared:${prepared.id}:${allocation?.seriesId ?? 'new'}:${mode}:${context.date}`,
    {
      date: context.date,
      time: '',
      occurrence: '',
      mealSlot: 'dinner',
      portionBasis: allocation?.portionWeightGrams != null ? 'weight' : 'servings',
      servings: String(defaultServings),
      grams: allocation?.portionWeightGrams?.toString() ?? '',
      state:
        allocation?.state === 'leftover'
          ? 'leftover'
          : allocation?.state === 'skipped'
            ? 'skipped'
            : 'served',
      note: allocation?.note ?? '',
      expectedId: allocation?.id ?? '',
      seriesId: allocation?.seriesId ?? '',
      operationId: '',
      uncertain: '',
    },
  );
  const [acknowledgedAllocation, setAcknowledgedAllocation] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const allocationChanged = Boolean(
    allocation &&
    allocation.id !== draft.expectedId &&
    !(
      acknowledgedAllocation?.id === draft.expectedId &&
      allocation.revision < acknowledgedAllocation.revision
    ),
  );
  useEffect(() => {
    if (!allocationChanged || dirty || draft.uncertain || !allocation) return;
    clear({
      ...draft,
      expectedId: allocation.id,
      seriesId: allocation.seriesId,
      servings: allocation.servings?.toString() ?? '',
      grams: allocation.portionWeightGrams?.toString() ?? '',
      portionBasis: allocation.portionWeightGrams != null ? 'weight' : 'servings',
      state:
        allocation.state === 'leftover' || allocation.state === 'skipped'
          ? allocation.state
          : 'served',
      note: allocation.note,
      operationId: '',
      uncertain: '',
    });
    // Only an acknowledged allocation identity change can refresh an untouched draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocation?.id, allocationChanged, dirty]);
  const [savedDate, setSavedDate] = useState('');
  function change(patch: Partial<typeof draft>) {
    update({ ...patch, operationId: '' });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context.canManage || request.isPending() || allocationChanged) return;
    try {
      const operationId = draft.operationId || createClientUuid();
      update({ operationId });
      let url = `/api/v1/nutrition/profiles/${context.profileId}/prepared-recipes/${prepared.id}/`;
      let body: object;
      if (mode === 'consume') {
        url += 'consume';
        body = {
          idempotencyKey: operationId,
          servingCount: draft.portionBasis === 'servings' ? Number(draft.servings) : null,
          portionWeightGrams: draft.portionBasis === 'weight' ? Number(draft.grams) : null,
          occurredAt: nutritionEventInstant(
            draft.date,
            draft.time,
            context.timeZone,
            draft.occurrence,
          ),
          mealSlot: draft.mealSlot,
          allocationSeriesId: draft.seriesId || undefined,
          supersedesAllocationVersionId: draft.expectedId || null,
          note: draft.note,
        };
      } else {
        url += 'allocations';
        body = {
          allocationSeriesId: draft.seriesId || operationId,
          supersedesAllocationVersionId: draft.expectedId || null,
          state: draft.state,
          servingCount: Number(draft.servings),
          note: draft.note,
        };
      }
      const result = await request.send<{
        allocation?: { id: string; seriesId: string; revision: number };
      }>(task, url, body, {
        replay: true,
        pending: mode === 'consume' ? 'Confirming eaten portion…' : 'Saving portion state…',
      });
      if (!result) {
        if (request.isUncertain(task)) update({ uncertain: 'yes' });
        return;
      }
      request.message(
        task,
        'success',
        mode === 'consume'
          ? `Food logged for ${context.profileName} · ${draft.date} · ${draft.mealSlot}.`
          : `Portion state saved for ${context.profileName}. Nothing was recorded as eaten.`,
      );
      setSavedDate(draft.date);
      if (allocation) {
        setAcknowledgedAllocation(
          result.allocation
            ? { id: result.allocation.id, revision: result.allocation.revision }
            : null,
        );
        clear({
          ...draft,
          expectedId: result.allocation?.id ?? draft.expectedId,
          seriesId: result.allocation?.seriesId ?? draft.seriesId,
          operationId: '',
          uncertain: '',
        });
      } else clear();
      router.refresh();
    } catch (error) {
      request.message(
        task,
        'error',
        error instanceof Error ? error.message : 'Check this portion.',
      );
    }
  }
  return (
    <form onSubmit={submit}>
      <p className={styles.helper}>
        {context.profileName} ·{' '}
        {mode === 'consume' ? `event date ${draft.date}` : 'saved portion state'}.{' '}
        {mode === 'consume'
          ? 'Only confirmation below records consumed food.'
          : 'This does not change consumed totals.'}
      </p>
      {notice && <p className={styles.helper}>{notice}</p>}
      {allocationChanged && allocation && (
        <div role="status" className={styles.helper}>
          <p>
            This portion changed to {allocation.state}, {allocation.servings ?? 'unknown'} servings
            (revision {allocation.revision}). Your entered values are retained. Review the current
            portion before continuing.
          </p>
          {!draft.uncertain && (
            <button
              type="button"
              disabled={request.pending}
              onClick={() =>
                update({
                  expectedId: allocation.id,
                  seriesId: allocation.seriesId,
                  operationId: '',
                })
              }
            >
              Use current version and keep my entries
            </button>
          )}
        </div>
      )}
      <fieldset
        className={formStyles.formFields}
        disabled={request.pending || !context.canManage || Boolean(draft.uncertain)}
      >
        {mode === 'state' ? (
          <>
            <label>
              Portion state
              <select
                value={draft.state}
                onChange={(event) => change({ state: event.target.value })}
              >
                <option value="served">Served, not eaten</option>
                <option value="leftover">Leftover, not eaten</option>
                {allocation && <option value="skipped">Skipped</option>}
              </select>
            </label>
            <label>
              Personal servings
              <input
                type="number"
                min="0.000001"
                max={allocation ? prepared.actualServings : prepared.remainingServings}
                step="any"
                value={draft.servings}
                onChange={(event) => change({ servings: event.target.value })}
                required
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Consumed portion basis
              <select
                value={draft.portionBasis}
                onChange={(event) => change({ portionBasis: event.target.value })}
              >
                <option value="servings">Serving count</option>
                {prepared.finalWeightGrams && <option value="weight">Weighed portion (g)</option>}
              </select>
            </label>
            {draft.portionBasis === 'weight' ? (
              <label>
                Amount consumed (g)
                <input
                  type="number"
                  min="0.000001"
                  max={
                    allocation
                      ? (prepared.finalWeightGrams ?? undefined)
                      : prepared.finalWeightGrams
                        ? (prepared.remainingServings / prepared.actualServings) *
                          prepared.finalWeightGrams
                        : undefined
                  }
                  step="any"
                  value={draft.grams}
                  onChange={(event) => change({ grams: event.target.value })}
                  required
                />
              </label>
            ) : (
              <label>
                Servings eaten
                <input
                  type="number"
                  min="0.000001"
                  max={allocation ? prepared.actualServings : prepared.remainingServings}
                  step="any"
                  value={draft.servings}
                  onChange={(event) => change({ servings: event.target.value })}
                  required
                />
              </label>
            )}
            <NutritionEventFields
              draft={draft}
              update={change}
              timeZone={context.timeZone}
              today={context.today}
            />
          </>
        )}
        <label>
          Note (optional)
          <input
            value={draft.note}
            maxLength={500}
            onChange={(event) => change({ note: event.target.value })}
          />
        </label>
      </fieldset>
      <button
        className={mode === 'consume' ? formStyles.primaryAction : undefined}
        type="submit"
        disabled={request.pending || !context.canManage || allocationChanged}
      >
        {request.busyTask === task
          ? 'Saving…'
          : draft.uncertain
            ? 'Retry exact request'
            : mode === 'consume'
              ? 'Confirm eaten'
              : 'Save portion state'}
      </button>
      <NutritionFeedback value={request.feedback[task]}>
        {savedDate && mode === 'consume' && (
          <Link className="inline-link" href={`/nutrition?view=diary&date=${savedDate}`}>
            View recorded diary day
          </Link>
        )}
      </NutritionFeedback>
      {draft.uncertain && (
        <>
          <Link className="inline-link" href="/nutrition?view=diary" target="_blank">
            Check saved diary before changing this request
          </Link>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Only start a different request after checking whether this one saved.',
                )
              ) {
                update({ uncertain: '', operationId: '' });
                request.message(task, 'error', 'Review the changed request before submitting.');
              }
            }}
          >
            Checked saved data — edit request
          </button>
        </>
      )}
    </form>
  );
}
