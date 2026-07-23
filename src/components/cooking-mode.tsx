'use client';

import { Check, ChevronLeft, ChevronRight, Heart, Play, Plus, Timer, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { convertTemperature, recipeYieldNumber, scaledQuantity } from '@/lib/domain/cooking';
import type { RecipeDetail } from '@/lib/services/recipe-service';

import styles from './cooking-mode.module.css';

type LocalTimer = { id: string; label: string; remaining: number; running: boolean };
type BatchDeduction = {
  batchId: string;
  locationName: string;
  expiryDate: string | null;
  quantity: number;
  unit: string;
  quantityBefore: number;
  batchUnit: string;
};
type ProductPreview = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  availableQuantity: number;
  sufficient: boolean;
  deductions: BatchDeduction[];
};
type ReviewLine = {
  ingredientId: string;
  ingredientName: string;
  productId: string;
  quantity: number;
  unit: string;
  decision: 'deduct' | 'skip' | 'inaccurate';
  note: string;
  preview: ProductPreview;
  compatibleProducts: ProductPreview[];
};
type LeftoverDraft = {
  id: string;
  productId: string;
  locationId: string;
  quantity: string;
  unit: string;
  useByDate: string;
};
export function CookingMode({
  recipe,
  initialFavorite,
  mealPlanEntryId,
  nutritionPreparation,
}: {
  recipe: RecipeDetail;
  initialFavorite: boolean;
  mealPlanEntryId?: string;
  nutritionPreparation: {
    profileId: string;
    calculationId: string;
    finalWeightGrams: number | null;
  } | null;
}) {
  const router = useRouter();
  const steps = useMemo(
    () =>
      recipe.instructionSections.flatMap((section) =>
        section.steps.map((step) => ({ section: section.title, body: step.body })),
      ),
    [recipe],
  );
  const baseServings = recipeYieldNumber(recipe.servings) ?? 1;
  const [servings, setServings] = useState(baseServings);
  const [step, setStep] = useState(0);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pantryReview, setPantryReview] = useState<ReviewLine[]>([]);
  const [plannedMeal, setPlannedMeal] = useState<{
    plannedFor: string;
    meal: string;
    title: string;
  } | null>(null);
  const [showPantryConfirmation, setShowPantryConfirmation] = useState(false);
  const [finishStatus, setFinishStatus] = useState('');
  const [pantryOptions, setPantryOptions] = useState<{
    products: Array<{ id: string; displayName: string }>;
    locations: Array<{ id: string; path: string }>;
  }>({ products: [], locations: [] });
  const [leftovers, setLeftovers] = useState<LeftoverDraft[]>([]);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [undoConflict, setUndoConflict] = useState(false);
  const [preparedServings, setPreparedServings] = useState(baseServings);
  const [preparationAttested, setPreparationAttested] = useState(false);
  const [preparedStatus, setPreparedStatus] = useState('');
  const [preparedCreated, setPreparedCreated] = useState(false);
  const [preparedSaving, setPreparedSaving] = useState(false);
  const preparedInstanceId = useRef<string | null>(null);
  const allocationRequestVersions = useRef(new Map<string, number>());
  const allocationTriplets = useRef(new Map<string, string>());
  const [timers, setTimers] = useState<LocalTimer[]>([]);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [temperature, setTemperature] = useState('');
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');
  useEffect(() => {
    const id = window.setInterval(
      () =>
        setTimers((current) =>
          current.map((timer) =>
            timer.running && timer.remaining > 0
              ? { ...timer, remaining: timer.remaining - 1 }
              : timer,
          ),
        ),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);
  const startCooking = async () => {
    const response = await fetch('/api/v1/cook-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: recipe.id, targetServings: servings, mealPlanEntryId }),
    });
    const body = (await response.json().catch(() => null)) as {
      session?: { id: string };
      pantry?: {
        plannedMeal?: { plannedFor: string; meal: string; title: string } | null;
        recommendedConsumptions?: Array<Omit<ReviewLine, 'decision' | 'note'>>;
      };
    } | null;
    if (body?.session) {
      setSessionId(body.session.id);
      setPlannedMeal(body.pantry?.plannedMeal ?? null);
      const review: ReviewLine[] = (body.pantry?.recommendedConsumptions ?? []).map((entry) => ({
        ...entry,
        decision: 'deduct',
        note: '',
      }));
      setPantryReview(review);
      allocationTriplets.current = new Map(
        review.map((entry) => [
          entry.ingredientId,
          `${entry.productId}\u0000${entry.quantity}\u0000${entry.unit}`,
        ]),
      );
      void fetch('/api/v1/pantry/summary')
        .then((result) => result.json())
        .then((summary) =>
          setPantryOptions({
            products: summary.dashboard?.products ?? summary.products ?? [],
            locations: summary.dashboard?.locations ?? summary.locations ?? [],
          }),
        );
    }
  };
  const finishCooking = async () => {
    setShowPantryConfirmation(true);
  };
  const confirmFinish = async () => {
    if (!sessionId) return;
    setFinishStatus('Saving confirmed deductions…');
    const confirmedLeftovers = leftovers.flatMap((leftover) =>
      leftover.productId && leftover.locationId && Number(leftover.quantity) > 0 && leftover.unit
        ? [
            {
              ...leftover,
              quantity: Number(leftover.quantity),
              notes: `Leftover from ${recipe.title}`,
              id: undefined,
            },
          ]
        : [],
    );
    const response = await fetch(`/api/v1/cook-sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmed: true,
        consumptions: pantryReview
          .filter((entry) => entry.decision === 'deduct')
          .map(({ productId, quantity, unit }) => ({ productId, quantity, unit })),
        leftovers: confirmedLeftovers.map(
          ({ productId, locationId, quantity, unit, useByDate, notes }) => ({
            productId,
            locationId,
            quantity,
            unit,
            ...(useByDate ? { useByDate } : {}),
            notes,
          }),
        ),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      setFinishStatus(body?.error?.message ?? 'Pantry stock changed. Review the deductions again.');
      return;
    }
    setFinishStatus('Cooking complete and Pantry updated.');
    setShowPantryConfirmation(false);
    setCompletedSessionId(sessionId);
    setSessionId(null);
    await fetch('/api/v1/pantry/summary', { cache: 'no-store' });
    router.refresh();
  };
  const refreshAllocation = async (
    index: number,
    patch: Partial<Pick<ReviewLine, 'productId' | 'quantity' | 'unit'>>,
  ) => {
    if (!sessionId) return;
    const current = pantryReview[index];
    if (!current) return;
    const next = { ...current, ...patch };
    const requestKey = current.ingredientId;
    const requestVersion = (allocationRequestVersions.current.get(requestKey) ?? 0) + 1;
    const requestedTriplet = `${next.productId}\u0000${next.quantity}\u0000${next.unit}`;
    allocationRequestVersions.current.set(requestKey, requestVersion);
    allocationTriplets.current.set(requestKey, requestedTriplet);
    setPantryReview((lines) => lines.map((line, position) => (position === index ? next : line)));
    const response = await fetch(`/api/v1/cook-sessions/${sessionId}/pantry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: next.productId, quantity: next.quantity, unit: next.unit }),
    });
    const preview = (await response.json().catch(() => null)) as
      ProductPreview | { error?: { message?: string } } | null;
    if (
      allocationRequestVersions.current.get(requestKey) !== requestVersion ||
      allocationTriplets.current.get(requestKey) !== requestedTriplet
    )
      return;
    if (!response.ok || !preview || 'error' in preview) {
      setFinishStatus(
        preview && 'error' in preview
          ? (preview.error?.message ?? 'Review this deduction.')
          : 'Review this deduction.',
      );
      return;
    }
    const allocation = preview as ProductPreview;
    setPantryReview((lines) =>
      lines.map((line, position) =>
        position === index &&
        `${line.productId}\u0000${line.quantity}\u0000${line.unit}` === requestedTriplet
          ? {
              ...line,
              ...patch,
              productId: allocation.productId,
              quantity: allocation.quantity,
              unit: allocation.unit,
              preview: allocation,
            }
          : line,
      ),
    );
  };
  const refreshPantryReview = async () => {
    const id = sessionId ?? completedSessionId;
    if (!id) return;
    const response = await fetch(`/api/v1/cook-sessions/${id}/pantry`, { cache: 'no-store' });
    if (response.ok) {
      const body = (await response.json()) as {
        recommendedConsumptions: Array<Omit<ReviewLine, 'decision' | 'note'>>;
      };
      setPantryReview(
        body.recommendedConsumptions.map((entry) => ({ ...entry, decision: 'deduct', note: '' })),
      );
      setFinishStatus('Pantry review refreshed. Confirm again when you are ready.');
      setUndoConflict(false);
    }
  };
  const undoPantry = async () => {
    if (!completedSessionId) return;
    const response = await fetch(`/api/v1/cook-sessions/${completedSessionId}/pantry/undo`, {
      method: 'POST',
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      setUndoConflict(response.status === 409);
      setFinishStatus(body?.error?.message ?? 'The Pantry deduction could not be undone.');
      return;
    }
    setFinishStatus('Pantry deductions undone. The cooking record remains complete.');
    setCompletedSessionId(null);
    await fetch('/api/v1/pantry/summary', { cache: 'no-store' });
    router.refresh();
  };
  const createPreparedNutrition = async () => {
    if (!completedSessionId || !nutritionPreparation || preparedSaving) return;
    preparedInstanceId.current ??= crypto.randomUUID();
    setPreparedSaving(true);
    setPreparedStatus('Saving prepared Nutrition batch…');
    const response = await fetch(
      `/api/v1/nutrition/profiles/${nutritionPreparation.profileId}/prepared-recipes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preparedInstanceId: preparedInstanceId.current,
          recipeCalculationId: nutritionPreparation.calculationId,
          mealPlanEntryId: mealPlanEntryId ?? null,
          cookSessionId: completedSessionId,
          actualServings: preparedServings,
          finalWeightGrams: nutritionPreparation.finalWeightGrams,
          preparationMatchesCalculation: true,
          note: `Prepared from cooking session for ${recipe.title}.`,
        }),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      setPreparedSaving(false);
      setPreparedStatus(body?.error?.message ?? 'The prepared Nutrition batch could not be saved.');
      return;
    }
    setPreparedSaving(false);
    setPreparedCreated(true);
    setPreparedStatus('Prepared Nutrition batch saved. Nothing has been marked eaten.');
    router.refresh();
  };
  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    const response = await fetch(`/api/v1/recipes/${recipe.id}/favorite`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: next }),
    });
    if (!response.ok) setFavorite(!next);
  };
  const addTimer = () => {
    const seconds = Math.max(1, Math.round(timerMinutes * 60));
    setTimers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: `Timer ${current.length + 1}`,
        remaining: seconds,
        running: true,
      },
    ]);
  };
  const formatted = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <main className="cooking-page">
      <header className="cooking-header">
        <Link className="quiet-link" href={`/recipes/${recipe.id}`}>
          ← Recipe card
        </Link>
        <button
          className="favorite-button"
          type="button"
          aria-pressed={favorite}
          onClick={() => void toggleFavorite()}
        >
          <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />{' '}
          {favorite ? 'Favorite' : 'Save favorite'}
        </button>
      </header>
      <section className="cooking-top">
        <div>
          <p className="eyebrow">COOKING {recipe.title.toUpperCase()}</p>
          <h1>{recipe.title}</h1>
          <div className="serving-control">
            <label>
              Cook for{' '}
              <input
                type="number"
                min="1"
                max="100"
                value={servings}
                onChange={(event) => setServings(Math.max(1, Number(event.target.value) || 1))}
              />{' '}
              servings
            </label>
            <button
              className="primary-button compact"
              type="button"
              onClick={() => void (sessionId ? finishCooking() : startCooking())}
            >
              {sessionId ? (
                <>
                  <Check size={16} /> Finish cooking
                </>
              ) : (
                <>
                  <Play size={16} /> Start cooking
                </>
              )}
            </button>
          </div>
        </div>
        <aside className="temperature-card">
          <strong>Temperature converter</strong>
          <div>
            <input
              aria-label="Temperature"
              inputMode="decimal"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
            />
            <select
              aria-label="Temperature unit"
              value={temperatureUnit}
              onChange={(event) => setTemperatureUnit(event.target.value as 'C' | 'F')}
            >
              <option value="C">°C</option>
              <option value="F">°F</option>
            </select>
          </div>
          {temperature && Number.isFinite(Number(temperature)) && (
            <p>
              {temperatureUnit === 'C'
                ? `${convertTemperature(Number(temperature), 'C')}°F`
                : `${convertTemperature(Number(temperature), 'F')}°C`}{' '}
              <span>converted — original recipe stays unchanged.</span>
            </p>
          )}
        </aside>
      </section>
      <section className="cooking-layout">
        <aside className="scaled-ingredients">
          <h2>Ingredients</h2>
          {recipe.ingredientGroups.map((group) => (
            <div key={group.id}>
              {group.name && <h3>{group.name}</h3>}
              <ul>
                {group.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>
                    <strong>
                      {scaledQuantity(ingredient.quantity, recipe.servings, servings) ?? ''}{' '}
                      {ingredient.unit}
                    </strong>{' '}
                    {ingredient.item}
                    {ingredient.note && <em> — {ingredient.note}</em>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
        <section className="step-focus">
          <p className="eyebrow">
            STEP {step + 1} OF {steps.length}
          </p>
          <h2>{steps[step]?.section || 'Method'}</h2>
          <p>{steps[step]?.body}</p>
          <div className="step-actions">
            <button
              className="text-button"
              type="button"
              disabled={step === 0}
              onClick={() => setStep((current) => current - 1)}
            >
              <ChevronLeft size={18} /> Back
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={step === steps.length - 1}
              onClick={() => setStep((current) => current + 1)}
            >
              Next step <ChevronRight size={18} />
            </button>
          </div>
        </section>
        <aside className={`timer-panel ${styles.timerPanel}`}>
          <h2>
            <Timer size={20} /> Timers
          </h2>
          <div className="add-timer">
            <input
              aria-label="Timer minutes"
              type="number"
              min="1"
              value={timerMinutes}
              onChange={(event) => setTimerMinutes(Number(event.target.value))}
            />
            <button className="text-button" type="button" onClick={addTimer}>
              <Plus size={16} /> Add
            </button>
          </div>
          {timers.length ? (
            timers.map((timer) => (
              <article key={timer.id}>
                <strong>{timer.label}</strong>
                <span>{formatted(timer.remaining)}</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    setTimers((current) =>
                      current.map((entry) =>
                        entry.id === timer.id ? { ...entry, running: !entry.running } : entry,
                      ),
                    )
                  }
                >
                  {timer.running ? 'Pause' : 'Resume'}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() =>
                    setTimers((current) => current.filter((entry) => entry.id !== timer.id))
                  }
                  aria-label={`Remove ${timer.label}`}
                >
                  <X size={14} />
                </button>
              </article>
            ))
          ) : (
            <p className="muted">Run as many local timers as you need.</p>
          )}
        </aside>
      </section>
      {showPantryConfirmation && (
        <section className={styles.confirmation} aria-labelledby="pantry-cook-confirmation">
          <h2 id="pantry-cook-confirmation">Confirm Pantry changes</h2>
          <p>
            <strong>Nothing is deducted until you press the confirmation button below.</strong>
          </p>
          {plannedMeal ? (
            <p className={styles.mealIdentity}>
              Planned meal: {plannedMeal.title} · {plannedMeal.meal} on {plannedMeal.plannedFor}
            </p>
          ) : null}
          {pantryReview.length ? (
            pantryReview.map((entry, index) => (
              <fieldset className={styles.deduction} key={entry.ingredientId}>
                <legend>{entry.ingredientName}</legend>
                <label>
                  Pantry product
                  <select
                    aria-label={`${entry.ingredientName} Pantry product`}
                    value={entry.productId}
                    disabled={entry.decision !== 'deduct'}
                    onChange={(event) =>
                      void refreshAllocation(index, { productId: event.target.value })
                    }
                  >
                    {entry.compatibleProducts.map((product) => (
                      <option key={product.productId} value={product.productId}>
                        {product.productName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity used
                  <input
                    aria-label={`Quantity used · Deduction ${index + 1} quantity · ${entry.ingredientName} deduction quantity`}
                    type="number"
                    min="0.000001"
                    step="any"
                    value={entry.quantity}
                    disabled={entry.decision !== 'deduct'}
                    onChange={(event) => {
                      const quantity = Number(event.target.value);
                      allocationRequestVersions.current.set(
                        entry.ingredientId,
                        (allocationRequestVersions.current.get(entry.ingredientId) ?? 0) + 1,
                      );
                      allocationTriplets.current.set(
                        entry.ingredientId,
                        `${entry.productId}\u0000${quantity}\u0000${entry.unit}`,
                      );
                      setPantryReview((current) =>
                        current.map((item, position) =>
                          position === index ? { ...item, quantity } : item,
                        ),
                      );
                    }}
                    onBlur={(event) =>
                      void refreshAllocation(index, { quantity: Number(event.currentTarget.value) })
                    }
                  />
                </label>
                <label>
                  Unit
                  <input
                    aria-label={`${entry.ingredientName} deduction unit`}
                    value={entry.unit}
                    disabled={entry.decision !== 'deduct'}
                    onChange={(event) => {
                      const unit = event.target.value;
                      allocationRequestVersions.current.set(
                        entry.ingredientId,
                        (allocationRequestVersions.current.get(entry.ingredientId) ?? 0) + 1,
                      );
                      allocationTriplets.current.set(
                        entry.ingredientId,
                        `${entry.productId}\u0000${entry.quantity}\u0000${unit}`,
                      );
                      setPantryReview((current) =>
                        current.map((item, position) =>
                          position === index ? { ...item, unit } : item,
                        ),
                      );
                    }}
                    onBlur={(event) =>
                      void refreshAllocation(index, { unit: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  Pantry tracking
                  <select
                    value={entry.decision}
                    aria-label={`${entry.ingredientName} Pantry tracking`}
                    onChange={(event) =>
                      setPantryReview((current) =>
                        current.map((item, position) =>
                          position === index
                            ? { ...item, decision: event.target.value as ReviewLine['decision'] }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="deduct">Deduct exact stock</option>
                    <option value="skip">Do not deduct</option>
                    <option value="inaccurate">Tracking is inaccurate</option>
                  </select>
                </label>
                {entry.decision === 'inaccurate' ? (
                  <label className={styles.fullRow}>
                    What is inaccurate?
                    <input
                      value={entry.note}
                      maxLength={500}
                      required
                      onChange={(event) =>
                        setPantryReview((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, note: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                ) : null}
                {entry.decision === 'deduct' ? (
                  <div className={styles.batchReview}>
                    <strong>
                      {entry.preview.sufficient
                        ? 'Expected FEFO batch reductions'
                        : 'Not enough exact compatible stock'}
                    </strong>
                    {entry.preview.deductions.map((batch) => (
                      <p key={batch.batchId}>
                        {batch.locationName} ·{' '}
                        {batch.expiryDate ? `expires ${batch.expiryDate}` : 'expiry unknown'} ·{' '}
                        {batch.quantity} {batch.unit} from {batch.quantityBefore} {batch.batchUnit}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className={styles.fullRow}>
                    No Pantry quantity will be deducted for this ingredient.
                  </p>
                )}
              </fieldset>
            ))
          ) : (
            <p>No exact mapped ingredient deductions are proposed.</p>
          )}
          <div className={styles.leftoverHeading}>
            <h3>Leftover batches</h3>
            <button
              type="button"
              onClick={() =>
                setLeftovers((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    productId: '',
                    locationId: '',
                    quantity: '',
                    unit: '',
                    useByDate: '',
                  },
                ])
              }
            >
              Add leftover
            </button>
          </div>
          {leftovers.map((leftover, index) => (
            <fieldset className={styles.leftover} key={leftover.id}>
              <legend>Leftover {index + 1}</legend>
              <select
                aria-label={`Leftover ${index + 1} product`}
                value={leftover.productId}
                onChange={(event) =>
                  setLeftovers((current) =>
                    current.map((item) =>
                      item.id === leftover.id ? { ...item, productId: event.target.value } : item,
                    ),
                  )
                }
              >
                <option value="">Choose product</option>
                {pantryOptions.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.displayName}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Leftover ${index + 1} location`}
                value={leftover.locationId}
                onChange={(event) =>
                  setLeftovers((current) =>
                    current.map((item) =>
                      item.id === leftover.id ? { ...item, locationId: event.target.value } : item,
                    ),
                  )
                }
              >
                <option value="">Choose location</option>
                {pantryOptions.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.path}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Leftover ${index + 1} quantity`}
                type="number"
                min="0.000001"
                step="any"
                value={leftover.quantity}
                onChange={(event) =>
                  setLeftovers((current) =>
                    current.map((item) =>
                      item.id === leftover.id ? { ...item, quantity: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                aria-label={`Leftover ${index + 1} unit`}
                placeholder="unit"
                value={leftover.unit}
                onChange={(event) =>
                  setLeftovers((current) =>
                    current.map((item) =>
                      item.id === leftover.id ? { ...item, unit: event.target.value } : item,
                    ),
                  )
                }
              />
              <label>
                Use by{' '}
                <input
                  aria-label={`Leftover ${index + 1} use-by date`}
                  type="date"
                  value={leftover.useByDate}
                  onChange={(event) =>
                    setLeftovers((current) =>
                      current.map((item) =>
                        item.id === leftover.id ? { ...item, useByDate: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setLeftovers((current) => current.filter((item) => item.id !== leftover.id))
                }
              >
                Remove
              </button>
            </fieldset>
          ))}
          <div className={styles.actions}>
            <button type="button" onClick={() => setShowPantryConfirmation(false)}>
              Keep cooking
            </button>
            <button
              className="primary-button"
              type="button"
              aria-label="Confirm deductions and finish · Confirm Pantry changes and finish cooking"
              disabled={
                pantryReview.some(
                  (entry) => entry.decision === 'deduct' && !entry.preview.sufficient,
                ) ||
                pantryReview.some((entry) => entry.decision === 'inaccurate' && !entry.note.trim())
              }
              onClick={() => void confirmFinish()}
            >
              Confirm Pantry changes and finish cooking
            </button>
          </div>
          {finishStatus && <p role="status">{finishStatus}</p>}
        </section>
      )}
      {!showPantryConfirmation && finishStatus && (
        <div className={styles.finishStatus}>
          <p role="status">{finishStatus}</p>
          {completedSessionId ? (
            <button type="button" onClick={() => void undoPantry()}>
              Undo Pantry deduction
            </button>
          ) : null}
          {undoConflict ? (
            <button type="button" onClick={() => void refreshPantryReview()}>
              Refresh Pantry review
            </button>
          ) : null}
          <p>
            <Link href="/pantry">View updated Pantry</Link> ·{' '}
            <Link href="/planner">View updated meal plan and groceries</Link>
          </p>
          {completedSessionId ? (
            nutritionPreparation ? (
              <section aria-labelledby="prepared-nutrition-after-cooking">
                <h2 id="prepared-nutrition-after-cooking">Create prepared Nutrition batch</h2>
                <p>
                  Link what was prepared to this cook session. This does not mark any portion eaten.
                </p>
                <label>
                  Actual servings prepared
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={preparedServings}
                    disabled={preparedCreated}
                    onChange={(event) => setPreparedServings(Number(event.target.value))}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={preparationAttested}
                    disabled={preparedCreated}
                    onChange={(event) => setPreparationAttested(event.target.checked)}
                  />{' '}
                  Ingredients and preparation match the selected Nutrition calculation.
                </label>
                <button
                  type="button"
                  disabled={
                    preparedCreated ||
                    preparedSaving ||
                    !preparationAttested ||
                    preparedServings <= 0
                  }
                  onClick={() => void createPreparedNutrition()}
                >
                  {preparedSaving ? 'Saving prepared batch…' : 'Create prepared Nutrition batch'}
                </button>
                {preparedStatus ? <p role="status">{preparedStatus}</p> : null}
                {preparedCreated ? (
                  <p>
                    <Link href="/nutrition?view=prepared">Review portions in Nutrition</Link>
                  </p>
                ) : null}
              </section>
            ) : (
              <p>
                <Link href={`/recipes/${recipe.id}`}>Calculate current recipe Nutrition</Link>{' '}
                before creating a prepared batch for this cook.
              </p>
            )
          ) : null}
        </div>
      )}
    </main>
  );
}
