'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientUuid } from '@/lib/client/client-uuid';
import { useToast } from './toast-provider';
type Meal = {
  id: string;
  recipeId: string | null;
  recipeTitle: string;
  meal: string;
  effectiveStatus: string;
};
type Result = {
  missingPortions: Array<{ profileId: string; name: string }>;
  loggedPortions: number;
  nutritionReview: string | null;
  pantryReview: boolean;
};
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function RecipeMadeButton({
  recipeId,
  initialDate,
}: {
  recipeId: string;
  initialDate?: string;
}) {
  const { showToast, dismissToast } = useToast();
  const router = useRouter();
  const [date, setDate] = useState(() =>
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today(),
  );
  const [meals, setMeals] = useState<Meal[]>([]);
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(Boolean(initialDate));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<{ key: string; body: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/v1/meal-plan?start=${date}&end=${date}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load the meal plan.');
        const data = await response.json();
        if (controller.signal.aborted) return;
        const matching = (data.meals as Meal[]).filter(
          (m) => m.recipeId === recipeId && ['planned', 'cooked'].includes(m.effectiveStatus),
        );
        setMeals(matching);
        setSelected(matching.length === 1 ? matching[0]!.id : '');
      } catch (error) {
        if (!controller.signal.aborted) showToast((error as Error).message, 'error');
      }
    }
    void load();
    return () => controller.abort();
  }, [date, open, recipeId, showToast]);
  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    const current = attempt ?? {
      key: createClientUuid(),
      body: JSON.stringify({
        recipeId,
        mealPlanEntryId: selected,
        portions:
          result?.missingPortions
            .filter((p) => answers[p.profileId])
            .map((p) => ({ profileId: p.profileId, servings: Number(answers[p.profileId]) })) ?? [],
      }),
    };
    setAttempt(current);
    try {
      const response = await fetch(`/api/v1/meal-plan/${selected}/made`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': current.key },
        body: current.body,
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500) setAttempt(null);
        throw new Error(
          data.error?.message ?? 'The meal could not be saved. Retry to check the same request.',
        );
      }
      setAttempt(null);
      setResult(data);
      setAnswers({});
      if (data.missingPortions.length)
        showToast('Some people have no planned portion. How much did they eat?', 'info', {
          key: `meal-portions:${selected}`,
          actions: [
            {
              label: 'Assign portions',
              onClick: () => {
                dismissToast(`meal-portions:${selected}`);
                router.push(`/recipes/${recipeId}?madeDate=${date}`);
                setOpen(true);
              },
            },
          ],
        });
      else dismissToast(`meal-portions:${selected}`);
      showToast(
        `Meal marked made. ${data.loggedPortions} planned portion${data.loggedPortions === 1 ? '' : 's'} logged.`,
        'success',
      );
      if (data.nutritionReview)
        showToast(data.nutritionReview, 'info', {
          key: `meal-nutrition:${selected}`,
          actions: [
            {
              label: 'Review nutrition',
              onClick: () => {
                dismissToast(`meal-nutrition:${selected}`);
                router.push('/nutrition');
              },
            },
          ],
        });
      if (data.pantryReview)
        showToast('Pantry deductions need review; stock was not changed.', 'info', {
          key: `meal-pantry:${selected}`,
          actions: [
            {
              label: 'Review pantry',
              onClick: () => {
                dismissToast(`meal-pantry:${selected}`);
                router.push('/pantry');
              },
            },
          ],
        });
      router.refresh();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card recipe-made-panel">
      {!open ? (
        <button type="button" className="primary-button" onClick={() => setOpen(true)}>
          I made this
        </button>
      ) : (
        <>
          <h2>Record this meal</h2>
          <p>
            Log each person’s planned portion. Exact mapped ingredients are deducted once; any
            pantry or nutrition gaps are shown for review.
          </p>
          <label>
            Meal date{' '}
            <input
              type="date"
              value={date}
              disabled={busy || !!attempt || !!result}
              onChange={(e) => {
                setDate(e.target.value);
                setSelected('');
                setMeals([]);
              }}
            />
          </label>
          <label>
            Planned meal{' '}
            <select
              value={selected}
              disabled={busy || !!attempt || !!result}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a meal</option>
              {meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.meal} · {m.recipeTitle}
                  {m.effectiveStatus === 'cooked' ? ' · already made' : ''}
                </option>
              ))}
            </select>
          </label>
          {!meals.length && (
            <p>
              No matching planned recipe on this date. Choose its planned date or add it in the{' '}
              <a href="/planner">meal planner</a>.
            </p>
          )}
          {result?.missingPortions.length ? (
            <fieldset disabled={busy || !!attempt}>
              <legend>How much did each person eat?</legend>
              <p>
                No portion was assigned for these people. Leave a field empty to record it later.
              </p>
              {result.missingPortions.map((p) => (
                <label key={p.profileId}>
                  {p.name} · servings{' '}
                  <input
                    type="number"
                    min="0.01"
                    max="100"
                    step="any"
                    value={answers[p.profileId] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [p.profileId]: e.target.value })}
                  />
                </label>
              ))}
            </fieldset>
          ) : null}
          {(!result || result.missingPortions.length > 0) && (
            <button
              type="button"
              className="primary-button"
              disabled={
                !selected || busy || (!!result && !attempt && !Object.values(answers).some(Boolean))
              }
              onClick={() => void save()}
            >
              {busy
                ? 'Saving…'
                : attempt
                  ? 'Retry same request'
                  : result
                    ? 'Log portions'
                    : 'Confirm made'}
            </button>
          )}
          <button
            type="button"
            disabled={busy || !!attempt}
            onClick={() => {
              setOpen(false);
              setResult(null);
            }}
          >
            Close
          </button>
        </>
      )}
    </section>
  );
}
