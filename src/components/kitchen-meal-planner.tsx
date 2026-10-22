'use client';
import { ZodError } from 'zod';
import {
  KITCHEN_MEASUREMENT_BASES,
  MEASUREMENT_BASIS_LABELS,
  MEASUREMENT_UNIT_LABELS,
  measurementUnitsFor,
  type MeasurementBasis,
  type MeasurementUnit,
} from '../../shared/kitchen-measurements';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { SettingsPageHeader } from './settings-page-header';
import { KITCHEN_CATALOG } from '@/lib/domain/kitchen-catalog';
import {
  kitchenPhaseSchema,
  kitchenPlanRequestSchema,
  type KitchenPhase,
  type KitchenPlan,
  type KitchenState,
} from '@/lib/domain/kitchen';
import type { RecipeDetail } from '@/lib/services/recipe-service';
import type { readCookingEpisode } from '@/lib/services/cooking-episode-service';
import { createClientUuid } from '@/lib/client/client-uuid';
import styles from './my-kitchen.module.css';
type Episode = Pick<
  ReturnType<typeof readCookingEpisode>,
  'contextRevision' | 'acceptedPlan' | 'acceptedPlanState'
> & { id: string };
const capabilities = [
  ...new Set(KITCHEN_CATALOG.flatMap((template) => template.capabilities)),
].sort();
export function KitchenMealPlanner({
  kitchen: initial,
  initialSources,
  episode,
  sessionRevision,
  initialActivePhases,
  initialUseIds,
}: {
  kitchen: KitchenState;
  initialSources: RecipeDetail[];
  episode: Episode | null;
  sessionRevision?: number;
  initialActivePhases: string[];
  initialUseIds: Record<string, string>;
}) {
  const [kitchen, setKitchen] = useState(initial);
  const [sources, setSources] = useState(initialSources);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([]);
  const [phases, setPhases] = useState<KitchenPhase[]>(episode?.acceptedPlan?.request.phases ?? []);
  const [strategy, setStrategy] = useState<'parallel' | 'sequence'>(
    episode?.acceptedPlan?.request.strategy ?? 'parallel',
  );
  const [maxHandsOn, setMaxHandsOn] = useState(episode?.acceptedPlan?.request.maxHandsOn ?? 1);
  const [contextRevision, setContextRevision] = useState(episode?.contextRevision);
  const [plan, setPlan] = useState<KitchenPlan | null>(episode?.acceptedPlan?.allocation ?? null);
  const [reviewed, setReviewed] = useState<ReturnType<
    typeof kitchenPlanRequestSchema.parse
  > | null>(episode?.acceptedPlan?.request ?? null);
  const [acceptedId, setAcceptedId] = useState(
    episode?.acceptedPlanState === 'compatible' ? (episode.acceptedPlan?.id ?? null) : null,
  );
  const [active, setActive] = useState<string[]>(initialActivePhases);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    episode?.acceptedPlanState === 'needs-review'
      ? 'The saved plan needs refreshed source, kitchen or episode review.'
      : '',
  );
  const [useIds, setUseIds] = useState(initialUseIds);
  const intent = useRef(createClientUuid());
  const generation = useRef(0);
  function invalidate() {
    generation.current++;
    setPlan(null);
    setReviewed(null);
    setAcceptedId(null);
    intent.current = createClientUuid();
  }
  function edit(id: string, patch: Partial<KitchenPhase>) {
    invalidate();
    setPhases(phases.map((phase) => (phase.id === id ? { ...phase, ...patch } : phase)));
  }
  async function json(path: string, body?: unknown, method = 'POST') {
    const response = await fetch(
      path,
      body === undefined
        ? { cache: 'no-store' }
        : {
            method,
            headers: {
              'Content-Type': 'application/json',
              'x-bord-expected-profile-id': kitchen.viewerProfileId,
            },
            body: JSON.stringify(body),
          },
    );
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error?.message ?? 'Could not complete this meal review.');
    return value;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(
        error instanceof ZodError
          ? 'Check phase steps, quantities, occupancy durations and fit fields. Your draft is retained.'
          : error instanceof Error
            ? error.message
            : 'Review failed. Your draft is retained.',
      );
    } finally {
      setBusy(false);
    }
  }
  function addSource(recipe: RecipeDetail) {
    if (episode && recipe.id === initialSources[0]?.id) recipe = initialSources[0]!;
    if (phases.length >= 40) {
      setMessage('A meal supports up to 40 phases.');
      return;
    }

    const requirements = recipe.equipmentRequirements.length
      ? recipe.equipmentRequirements
      : [null];
    const next = requirements.map((requirement) =>
      kitchenPhaseSchema.parse({
        id: createClientUuid(),
        recipeId: recipe.id,
        recipeRevision: recipe.currentRevision,
        ...(episode && recipe.id === initialSources[0]?.id
          ? { cookSessionId: episode.id, cookSessionRevision: sessionRevision }
          : {}),
        stepRefs: requirement?.steps
          .map((ref) => recipe.instructionSections[ref.section]?.steps[ref.step]?.id)
          .filter(Boolean) ?? [recipe.instructionSections[0]!.steps[0]!.id],
        capability: requirement?.capability ?? 'heat-electric',
        quantity: requirement?.quantity ?? 1,
        amount: requirement?.amount,
        capacityReviewRequired: requirement?.capacityReviewRequired ?? true,
        mode: requirement?.mode,
        vesselCapability: requirement?.vesselCapability,
        temperatureC: requirement?.temperatureC,
        cavityLoad: requirement?.cavityLoad,
        needsVessel: (requirement?.capability ?? 'heat-electric').startsWith('heat-'),
        durationMinutes: Math.max(1, recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes),
      }),
    );
    if (phases.length + next.length > 40)
      throw new Error(
        'This component exceeds the 40-phase meal limit. Nothing was omitted or added; choose a smaller coordinated meal.',
      );
    invalidate();
    setSources((current) =>
      current.some((source) => source.id === recipe.id) ? current : [...current, recipe],
    );
    setPhases((current) => [...current, ...next]);
    setMessage(
      requirements[0]
        ? 'Reviewed recipe requirements loaded. Check each phase and its occupancy estimates.'
        : 'This recipe has no structured requirements. The suggested heat source is an unsaved placeholder: choose the actual capability, step and fit constraints before checking.',
    );
  }
  async function check() {
    await run(async () => {
      const token = ++generation.current;
      const current = (await json('/api/v1/kitchen')).kitchen as KitchenState;
      const request = kitchenPlanRequestSchema.parse({
        expectedRevision: current.revision,
        ...(episode ? { episodeId: episode.id, episodeContextRevision: contextRevision } : {}),
        phases,
        strategy,
        maxHandsOn,
      });
      const result = await json('/api/v1/kitchen/check', request);
      if (token !== generation.current) return;
      setKitchen(current);
      setPlan(result.plan);
      setReviewed(request);
      setAcceptedId(null);
      intent.current = createClientUuid();
      if (episode) {
        const claims = await json('/api/v1/kitchen/claims');
        setUseIds(
          Object.fromEntries(
            claims.claims
              .filter((claim: { episodeId: string }) => claim.episodeId === episode.id)
              .map((claim: { phaseId: string; useId: string }) => [claim.phaseId, claim.useId]),
          ),
        );
        setActive(
          claims.claims
            .filter((claim: { episodeId: string }) => claim.episodeId === episode.id)
            .map((claim: { phaseId: string }) => claim.phaseId),
        );
      }
    });
  }
  async function accept() {
    if (!episode || !reviewed) return;
    await run(async () => {
      const saved = await json(
        `/api/v1/cook-sessions/${episode.id}/context`,
        {
          kind: 'accept-plan',
          operationId: intent.current,
          expectedContextRevision: contextRevision,
          plan: reviewed,
        },
        'PATCH',
      );
      setAcceptedId(saved.acceptedPlan.id);
      setMessage('Meal equipment plan saved. Future phases remain unclaimed.');
    });
  }
  async function track(phaseId: string, release: boolean) {
    if (!episode) return;
    await run(async () => {
      const result = await json('/api/v1/kitchen/claims', {
        operation: release ? 'release' : 'start',
        episodeId: episode.id,
        phaseId,
        ...(release
          ? { acknowledged: true, expectedUseId: useIds[phaseId] }
          : { acceptedPlanId: acceptedId }),
      });
      setActive(
        result.claims
          .filter((claim: { episodeId: string }) => claim.episodeId === episode.id)
          .map((claim: { phaseId: string }) => claim.phaseId),
      );
      setUseIds(
        Object.fromEntries(
          result.claims
            .filter((claim: { episodeId: string }) => claim.episodeId === episode.id)
            .map((claim: { phaseId: string; useId: string }) => [claim.phaseId, claim.useId]),
        ),
      );
      setMessage(
        release
          ? 'Physical release acknowledged. Other phases remain occupied.'
          : result.phaseState === 'released'
            ? 'This use was already released. Check and accept a new plan for an explicit repeat.'
            : 'This phase is physically in use until release is acknowledged.',
      );
    });
  }
  return (
    <main className={`recipe-page settings-hub ${styles.workspace}`}>
      <SettingsPageHeader
        eyebrow="My Kitchen"
        title="Coordinate a meal"
        description="Check all dinner components against the same physical kitchen."
      />
      <section className="settings-card">
        <p>
          Shared with your household. This is one explicitly coordinated meal. A date and meal slot
          do not establish overlap by themselves.
        </p>
        <p>
          Previewing creates no equipment claims. Durations are estimates; include preheating,
          pressure release, holding, transfers and cleaning. A vessel holding food remains occupied
          until you acknowledge release.
        </p>
        {!episode && (
          <p>
            Preview only. To save and track a dinner, start its main recipe in cooking mode, then
            open “Coordinate this meal” there.
          </p>
        )}
        <fieldset disabled={busy}>
          <label>
            Find a dinner component
            <input
              value={query}
              maxLength={160}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() =>
              void run(async () =>
                setMatches(
                  (await json(`/api/v1/recipes?q=${encodeURIComponent(query)}`)).library.recipes,
                ),
              )
            }
          >
            Search recipes
          </button>
          <ul>
            {matches.map((recipe) => (
              <li key={recipe.id}>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void run(async () =>
                      addSource((await json(`/api/v1/recipes/${recipe.id}`)).recipe),
                    )
                  }
                >
                  Add component: {recipe.title}
                </button>
              </li>
            ))}
          </ul>
          {!phases.length && initialSources[0] && (
            <button
              className="primary-button"
              onClick={() => void run(async () => addSource(initialSources[0]!))}
            >
              Add main recipe: {initialSources[0].title}
            </button>
          )}
          <label>
            Resource order
            <select
              value={strategy}
              onChange={(event) => {
                invalidate();
                setStrategy(event.target.value as 'parallel' | 'sequence');
              }}
            >
              <option value="parallel">Try phases together; respect dependencies</option>
              <option value="sequence">Sequence every phase</option>
            </select>
          </label>
          <label>
            Comfortable simultaneous hands-on tasks
            <input
              type="number"
              min={1}
              max={8}
              value={maxHandsOn}
              onChange={(event) => {
                invalidate();
                setMaxHandsOn(Number(event.target.value));
              }}
            />
          </label>
          {phases.map((phase, index) => {
            const source = sources.find((source) => source.id === phase.recipeId);
            const steps = source?.instructionSections.flatMap((section) => section.steps) ?? [];
            return (
              <fieldset key={phase.id}>
                <legend>
                  Component phase {index + 1} · {source?.title ?? 'Saved recipe source'}
                </legend>
                <label>
                  Required capability
                  <select
                    value={phase.capability}
                    onChange={(event) =>
                      edit(phase.id, {
                        capability: event.target.value,
                        needsVessel: event.target.value.startsWith('heat-'),
                      })
                    }
                  >
                    {[...new Set([...capabilities, phase.capability])].map((capability) => (
                      <option key={capability} value={capability}>
                        {capability.replaceAll('-', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Associated recipe step
                  <select
                    value={phase.stepRefs[0] ?? ''}
                    onChange={(event) => edit(phase.id, { stepRefs: [event.target.value] })}
                  >
                    {!steps.some((step) => step.id === phase.stepRefs[0]) && (
                      <option value={phase.stepRefs[0] ?? ''}>
                        Source changed: refresh this component
                      </option>
                    )}
                    {steps.map((step, index) => (
                      <option key={step.id} value={step.id}>
                        Step {index + 1}: {step.body.slice(0, 120)}
                      </option>
                    ))}
                  </select>
                </label>
                {phase.stepRefs.length > 1 && (
                  <p>
                    This reviewed requirement also covers {phase.stepRefs.length - 1} additional
                    steps. Selecting a different step replaces that group.
                  </p>
                )}
                <div className={styles.fields}>
                  <label>
                    Physical resource quantity
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={phase.quantity}
                      onChange={(event) => edit(phase.id, { quantity: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Occupancy estimate (minutes)
                    <input
                      type="number"
                      min={1}
                      max={10080}
                      value={phase.durationMinutes}
                      onChange={(event) =>
                        edit(phase.id, { durationMinutes: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Additional release, holding, transfer and cleaning (minutes)
                    <input
                      type="number"
                      min={0}
                      max={10080}
                      value={phase.releaseMinutes}
                      onChange={(event) =>
                        edit(phase.id, { releaseMinutes: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={phase.handsOn}
                    onChange={(event) => edit(phase.id, { handsOn: event.target.checked })}
                  />
                  Hands-on work throughout this phase
                </label>
                <label>
                  Start after
                  <select
                    value={phase.after[0] ?? ''}
                    onChange={(event) =>
                      edit(phase.id, { after: event.target.value ? [event.target.value] : [] })
                    }
                  >
                    <option value="">No required predecessor</option>
                    {phases
                      .filter((other) => other.id !== phase.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          Component phase {phases.indexOf(other) + 1}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={phase.capacityReviewRequired}
                    onChange={(event) =>
                      edit(phase.id, { capacityReviewRequired: event.target.checked })
                    }
                  />
                  Capacity or fit needs information if no measured requirement is supplied
                </label>
                <p>
                  Leave this checked when size matters and is unknown. Clearing it states that this
                  phase has no size constraint; it does not establish unlimited capacity.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(phase.amount)}
                    onChange={(event) =>
                      edit(phase.id, {
                        amount: event.target.checked
                          ? {
                              value: 0,
                              unit: 'l',
                              basis: 'working-liquid',
                              provenance: 'user-confirmed',
                            }
                          : undefined,
                      })
                    }
                  />
                  Supply a measured capacity requirement
                </label>
                {phase.amount && (
                  <fieldset>
                    <legend>Required capacity · Phase {index + 1}</legend>
                    <label>
                      Measurement basis
                      <select
                        value={phase.amount.basis}
                        onChange={(event) => {
                          const basis = event.target.value as MeasurementBasis;
                          edit(phase.id, {
                            amount: {
                              ...phase.amount!,
                              basis,
                              unit: measurementUnitsFor(basis)[0],
                              deviceCupMl: undefined,
                            },
                          });
                        }}
                      >
                        {KITCHEN_MEASUREMENT_BASES.map((basis) => (
                          <option value={basis} key={basis}>
                            {MEASUREMENT_BASIS_LABELS[basis]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Required value
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        value={phase.amount.value || ''}
                        onChange={(event) =>
                          edit(phase.id, {
                            amount: { ...phase.amount!, value: Number(event.target.value) },
                          })
                        }
                      />
                    </label>
                    <label>
                      Unit
                      <select
                        value={phase.amount.unit}
                        onChange={(event) =>
                          edit(phase.id, {
                            amount: {
                              ...phase.amount!,
                              unit: event.target.value as MeasurementUnit,
                              deviceCupMl: undefined,
                            },
                          })
                        }
                      >
                        {measurementUnitsFor(phase.amount.basis).map((unit) => (
                          <option value={unit} key={unit}>
                            {MEASUREMENT_UNIT_LABELS[unit]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {phase.amount.unit === 'device-cups' && (
                      <label>
                        Device rice cup volume (mL)
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={phase.amount.deviceCupMl ?? ''}
                          onChange={(event) =>
                            edit(phase.id, {
                              amount: { ...phase.amount!, deviceCupMl: Number(event.target.value) },
                            })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Capacity applies to mode or food (optional)
                      <input
                        value={phase.amount.mode ?? ''}
                        maxLength={80}
                        onChange={(event) =>
                          edit(phase.id, {
                            amount: { ...phase.amount!, mode: event.target.value || undefined },
                          })
                        }
                      />
                    </label>
                  </fieldset>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={phase.needsVessel || phase.capability.startsWith('heat-')}
                    disabled={phase.capability.startsWith('heat-')}
                    onChange={(event) => edit(phase.id, { needsVessel: event.target.checked })}
                  />
                  Requires a separate compatible vessel as well as the heat source
                </label>
                {phase.needsVessel && (
                  <label>
                    Required vessel capability
                    <select
                      value={phase.vesselCapability ?? ''}
                      onChange={(event) =>
                        edit(phase.id, {
                          vesselCapability: (event.target.value ||
                            undefined) as KitchenPhase['vesselCapability'],
                        })
                      }
                    >
                      <option value="">Suitable cookware for this heat source</option>
                      <option value="pressure-vessel">Confirmed pressure-rated vessel</option>
                      <option value="vessel">Stovetop cookware</option>
                      <option value="bakeware">Bakeware</option>
                    </select>
                  </label>
                )}
                {['bake', 'roast', 'convection', 'steam'].includes(phase.capability) && (
                  <fieldset>
                    <legend>Optional shared-cavity review · Phase {index + 1}</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(phase.cavityLoad)}
                        onChange={(event) =>
                          edit(phase.id, {
                            cavityLoad: event.target.checked
                              ? { widthMm: 0, depthMm: 0, heightMm: 0 }
                              : undefined,
                            mode: phase.mode ?? phase.capability,
                          })
                        }
                      />
                      Check a measured dish footprint for cavity co-use
                    </label>
                    {phase.cavityLoad && (
                      <>
                        <p>
                          Measure the complete footprint including placement clearance. This uses
                          one level; shelves, stacking and rotation are not assumed. Record usable
                          cavity dimensions in My Kitchen. Working capacity remains a separate
                          requirement.
                        </p>
                        <label>
                          Confirmed oven mode
                          <select
                            value={phase.mode ?? ''}
                            onChange={(event) => edit(phase.id, { mode: event.target.value })}
                          >
                            {['bake', 'roast', 'convection', 'steam'].map((mode) => (
                              <option value={mode} key={mode}>
                                {mode}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Temperature (°C)
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={phase.temperatureC ?? ''}
                            onChange={(event) =>
                              edit(phase.id, {
                                temperatureC: event.target.value
                                  ? Number(event.target.value)
                                  : undefined,
                              })
                            }
                          />
                        </label>
                        {(['widthMm', 'depthMm', 'heightMm'] as const).map((dimension) => (
                          <label key={dimension}>
                            Dish {dimension.replace('Mm', '')} including clearance (mm)
                            <input
                              type="number"
                              min={1}
                              max={10000}
                              value={phase.cavityLoad![dimension] || ''}
                              onChange={(event) =>
                                edit(phase.id, {
                                  cavityLoad: {
                                    ...phase.cavityLoad!,
                                    [dimension]: Number(event.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </>
                    )}
                  </fieldset>
                )}
                <button
                  className="secondary-button"
                  onClick={() => {
                    invalidate();
                    setPhases(
                      phases
                        .filter((other) => other.id !== phase.id)
                        .map((other) => ({
                          ...other,
                          after: other.after.filter((id) => id !== phase.id),
                        })),
                    );
                  }}
                >
                  Remove phase {index + 1}
                </button>
              </fieldset>
            );
          })}
          <button className="primary-button" disabled={!phases.length} onClick={() => void check()}>
            Check the complete meal
          </button>
        </fieldset>
        <p role="status">{message}</p>
        {plan && (
          <section aria-label="Complete meal equipment review">
            <h2>
              {plan.status === 'compatible'
                ? 'Compatible under the reviewed constraints'
                : plan.status === 'needs-information'
                  ? 'More information needed'
                  : 'Equipment conflict'}
            </h2>
            <p>
              Relative occupancy estimate:{' '}
              {Math.max(0, ...plan.assignments.map((assignment) => assignment.end))} minutes for
              allocated phases. Unresolved phases are not included in that estimate.
            </p>
            <ul>
              {plan.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <ol>
              {plan.assignments.map((assignment) => (
                <li key={assignment.phaseId}>
                  {sources.find(
                    (source) =>
                      source.id ===
                      phases.find((phase) => phase.id === assignment.phaseId)?.recipeId,
                  )?.title ?? 'Recipe phase'}{' '}
                  ·{' '}
                  {assignment.resourceIds
                    .map(
                      (id) =>
                        kitchen.items.find((item) => id.startsWith(`${item.id}:`))?.name ??
                        'Shared restriction',
                    )
                    .join(' + ')}{' '}
                  · relative minutes {assignment.start}–{assignment.end}
                  {episode && kitchen.canManage && acceptedId && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void track(assignment.phaseId, active.includes(assignment.phaseId))
                      }
                    >
                      {active.includes(assignment.phaseId)
                        ? 'Confirm equipment is physically free'
                        : 'Start this phase'}
                    </button>
                  )}
                </li>
              ))}
            </ol>
            <p>{plan.assumptions.join(' ')}</p>
            {episode && plan.status === 'compatible' && !acceptedId && (
              <button className="primary-button" disabled={busy} onClick={() => void accept()}>
                Accept this complete meal plan
              </button>
            )}
            {acceptedId && (
              <p>
                Saved for this cooking episode. Starting one phase does not claim future phases.
              </p>
            )}
          </section>
        )}
        {episode && (
          <>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const current = await json(`/api/v1/cook-sessions/${episode.id}/context`);
                  setMessage(
                    `Current restrictions: ${current.restrictions ? `${current.restrictions.validOn} in ${current.restrictions.timezone}; ${current.restrictionsActive ? 'active' : 'inactive'}` : 'none'}. Review them in cooking mode, then check the meal again.`,
                  );
                  setContextRevision(current.contextRevision);
                  invalidate();
                })
              }
            >
              Review current episode restrictions before a new check
            </button>
            <p>
              <Link href={`/recipes/${initialSources[0]?.id}/cook?sessionId=${episode.id}`}>
                Return to this cooking session
              </Link>
            </p>
          </>
        )}
        <Link href="/my-kitchen">My Kitchen inventory</Link>
      </section>
    </main>
  );
}
