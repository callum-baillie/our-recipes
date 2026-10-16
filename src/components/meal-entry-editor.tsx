'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { mealTypeLabel, type MealType } from './meal-planner-types';
import { comparePlannedMeals } from '@/lib/domain/meal-plan-policy';
import { parseMealPlanIngredientSnapshot } from '@/lib/domain/meal-plan-snapshot';
import type { RecipePayload } from '@/lib/domain/recipe';
import type { PlannedMeal } from '@/lib/services/planning-service';
import type { RecipeDetail } from '@/lib/services/recipe-service';
import styles from './meal-entry-editor.module.css';

type Adaptation = Pick<
  RecipePayload,
  'title' | 'summary' | 'servings' | 'ingredientGroups' | 'instructionSections'
>;
export function MealEntryEditor({
  entry,
  initialKind,
  date,
  slot,
  slots,
  meals,
  servings,
  onClose,
  onSaved,
}: {
  entry?: PlannedMeal;
  initialKind?: string;
  date: string;
  slot: string;
  slots: string[];
  meals: PlannedMeal[];
  servings: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sourceMeals, setSourceMeals] = useState(meals);
  const [kind, setKind] = useState(entry?.kind ?? initialKind ?? 'item');
  const [plannedFor, setDate] = useState(entry?.plannedFor ?? date);
  const [meal, setMeal] = useState(entry?.meal ?? slot);
  const [title, setTitle] = useState(entry?.title || entry?.recipeTitle || '');
  const [portionCount, setPortions] = useState(entry?.servings ?? Math.max(1, servings));
  const [note, setNote] = useState(entry?.note ?? '');
  const [sourceId, setSource] = useState(entry?.leftoverSourceId ?? '');
  const snapshot = entry ? parseMealPlanIngredientSnapshot(entry.recipeIngredientsSnapshot) : null;
  const [quantity, setQuantity] = useState(String(snapshot?.ingredients[0]?.quantity ?? 1));
  const [unit, setUnit] = useState(snapshot?.ingredients[0]?.unit ?? 'each');
  const [adaptation, setAdaptation] = useState<Adaptation | null>(() =>
    entry?.recipeOverride ? (JSON.parse(entry.recipeOverride) as Adaptation) : null,
  );
  const [adapt, setAdapt] = useState(Boolean(entry?.recipeOverride));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loading = adapt && !adaptation && !error;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (kind !== 'leftover' || !plannedFor) return;
    let active = true;
    const start = new Date(`${plannedFor}T12:00:00Z`);
    if (!Number.isFinite(start.getTime())) return;
    start.setUTCDate(start.getUTCDate() - 30);
    void fetch(`/api/v1/meal-plan?start=${start.toISOString().slice(0, 10)}&end=${plannedFor}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load earlier meals.');
        const body = (await response.json()) as { meals: PlannedMeal[] };
        if (active) setSourceMeals(body.meals);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : 'Could not load meals.');
      });
    return () => {
      active = false;
    };
  }, [kind, plannedFor]);
  useEffect(() => {
    if (!adapt || adaptation || !entry?.recipeId) return;
    let active = true;
    void fetch(`/api/v1/recipes/${entry.recipeId}?mealPlanEntryId=${entry.id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the original recipe.');
        const { recipe } = (await response.json()) as { recipe: RecipeDetail };
        if (active)
          setAdaptation({
            title: recipe.title,
            summary: recipe.summary,
            servings: recipe.servings,
            ingredientGroups: recipe.ingredientGroups.map((group) => ({
              name: group.name,
              ingredients: group.ingredients.map((item) => ({
                ...item,
                quantity: item.quantity ?? '',
              })),
            })),
            instructionSections: recipe.instructionSections.map((section) => ({
              title: section.title,
              steps: section.steps.map((step) => step.body),
            })),
          });
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : 'Could not load recipe.');
      });
    return () => {
      active = false;
    };
  }, [adapt, adaptation, entry?.recipeId, entry?.id]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const selectedSource = sourceMeals.find((item) => item.id === sourceId);
      const payload = {
        plannedFor,
        meal,
        kind,
        title: kind === 'leftover' ? (selectedSource?.recipeTitle ?? title) : title,
        servings: portionCount,
        note,
        recipeId: kind === 'recipe' ? (entry?.recipeId ?? '') : '',
        leftoverSourceId: kind === 'leftover' ? sourceId : null,
        foodItem:
          kind === 'item'
            ? {
                item: title,
                quantity: quantity === '' ? '' : Number(quantity),
                unit,
                note: '',
                shoppingCategory: snapshot?.ingredients[0]?.shoppingCategory ?? 'Other',
                pantryProductId:
                  snapshot?.ingredients[0]?.item === title
                    ? (snapshot.ingredients[0].productId ?? '')
                    : '',
              }
            : null,
        ...(kind === 'recipe' && (adapt || entry?.recipeOverride)
          ? { recipeOverride: adapt ? adaptation : null }
          : {}),
        ...(entry ? { expectedUpdatedAt: new Date(entry.updatedAt).toISOString() } : {}),
      };
      const response = await fetch(entry ? `/api/v1/meal-plan/${entry.id}` : '/api/v1/meal-plan', {
        method: entry ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || 'Could not save this meal.');
      }
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this meal.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="meal-editor-title"
    >
      <form onSubmit={save}>
        <header>
          <div>
            <h2 id="meal-editor-title">{entry ? 'Edit planned meal' : 'Add a meal'}</h2>
            <p>A recipe, something simple, or a night off cooking.</p>
          </div>
          <button type="button" aria-label="Close meal editor" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className={styles.content}>
          <div className={styles.row}>
            <label>
              Date
              <input
                required
                type="date"
                value={plannedFor}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              Meal
              <select value={meal} onChange={(event) => setMeal(event.target.value)}>
                {[...new Set([...slots, meal])].map((value) => (
                  <option key={value} value={value}>
                    {mealTypeLabel(value as MealType)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            What’s planned?
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {entry?.recipeId ? <option value="recipe">Recipe</option> : null}
              <option value="item">Single food or drink</option>
              <option value="takeout">Takeout</option>
              <option value="leftover">Leftovers</option>
              <option value="custom">Other meal</option>
            </select>
          </label>
          {kind === 'leftover' ? (
            <>
              <label>
                Use leftovers from
                <select
                  required
                  value={sourceId}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="">Choose the original meal</option>
                  {sourceMeals
                    .filter(
                      (item) =>
                        item.id !== entry?.id &&
                        comparePlannedMeals(item, { plannedFor, meal }) <= 0 &&
                        item.status === 'planned' &&
                        item.kind !== 'leftover' &&
                        item.kind !== 'takeout' &&
                        (Boolean(item.recipeId) || item.kind === 'item'),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.plannedFor} · {mealTypeLabel(item.meal as MealType)} ·{' '}
                        {item.recipeTitle}
                      </option>
                    ))}
                </select>
              </label>
              <p>
                These portions come from the original meal and won’t add ingredients to your
                shopping list. Include the extra portions when setting that meal’s servings.
              </p>
            </>
          ) : (
            <label>
              {kind === 'takeout' ? 'Restaurant or meal' : 'Meal or food name'}
              <input
                required
                maxLength={160}
                readOnly={kind === 'recipe'}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  kind === 'item'
                    ? 'e.g. Greek yogurt'
                    : kind === 'takeout'
                      ? 'e.g. Pizza night'
                      : ''
                }
              />
            </label>
          )}
          <div className={styles.row}>
            <label>
              Servings
              <input
                required
                type="number"
                min={1}
                max={100}
                value={portionCount}
                onChange={(event) => setPortions(Number(event.target.value))}
              />
            </label>
            {kind === 'item' ? (
              <>
                <label>
                  Amount per serving
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </label>
                <label>
                  Unit
                  <input
                    maxLength={30}
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          {kind === 'item' ? (
            <p>
              This food will be included in your planner shopping list. Nutrition stays unknown
              until you supply nutrition data.
            </p>
          ) : null}
          {kind === 'recipe' ? (
            <>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={adapt}
                  onChange={(event) => setAdapt(event.target.checked)}
                />
                Adapt the recipe for this meal only
              </label>
              <p>
                Your saved recipe stays unchanged. Turning this off restores its current recipe.
              </p>
              {loading ? <p role="status">Loading recipe…</p> : null}
              {adapt && adaptation ? (
                <section className={styles.adaptation}>
                  <label>
                    Adapted recipe title
                    <input
                      required
                      value={adaptation.title}
                      onChange={(event) =>
                        setAdaptation({ ...adaptation, title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Recipe yield
                    <input
                      required
                      value={adaptation.servings}
                      onChange={(event) =>
                        setAdaptation({ ...adaptation, servings: event.target.value })
                      }
                    />
                  </label>
                  <p>
                    Ingredient quantities below are for the recipe yield. Shopping amounts scale to
                    this meal’s servings. Nutrition will need recalculating after changes.
                  </p>
                  {adaptation.ingredientGroups.map((group, g) => (
                    <fieldset key={g}>
                      <legend>{group.name || 'Ingredients'}</legend>
                      {group.ingredients.map((ingredient, i) => (
                        <div className={styles.ingredient} key={i}>
                          <input
                            aria-label="Quantity"
                            type="number"
                            min="0.001"
                            step="any"
                            value={ingredient.quantity}
                            onChange={(event) =>
                              setAdaptation({
                                ...adaptation,
                                ingredientGroups: adaptation.ingredientGroups.map((other, index) =>
                                  index !== g
                                    ? other
                                    : {
                                        ...other,
                                        ingredients: other.ingredients.map((item, n) =>
                                          n !== i
                                            ? item
                                            : {
                                                ...item,
                                                quantity:
                                                  event.target.value === ''
                                                    ? ''
                                                    : Number(event.target.value),
                                              },
                                        ),
                                      },
                                ),
                              })
                            }
                          />
                          <input
                            aria-label="Unit"
                            value={ingredient.unit}
                            onChange={(event) =>
                              setAdaptation({
                                ...adaptation,
                                ingredientGroups: adaptation.ingredientGroups.map((other, index) =>
                                  index !== g
                                    ? other
                                    : {
                                        ...other,
                                        ingredients: other.ingredients.map((item, n) =>
                                          n !== i ? item : { ...item, unit: event.target.value },
                                        ),
                                      },
                                ),
                              })
                            }
                          />
                          <input
                            aria-label="Ingredient"
                            required
                            value={ingredient.item}
                            onChange={(event) =>
                              setAdaptation({
                                ...adaptation,
                                ingredientGroups: adaptation.ingredientGroups.map((other, index) =>
                                  index !== g
                                    ? other
                                    : {
                                        ...other,
                                        ingredients: other.ingredients.map((item, n) =>
                                          n !== i
                                            ? item
                                            : {
                                                ...item,
                                                item: event.target.value,
                                                pantryProductId: '',
                                              },
                                        ),
                                      },
                                ),
                              })
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${ingredient.item}`}
                            disabled={group.ingredients.length === 1}
                            onClick={() =>
                              setAdaptation({
                                ...adaptation,
                                ingredientGroups: adaptation.ingredientGroups.map((other, index) =>
                                  index !== g
                                    ? other
                                    : {
                                        ...other,
                                        ingredients: other.ingredients.filter((_, n) => n !== i),
                                      },
                                ),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setAdaptation({
                            ...adaptation,
                            ingredientGroups: adaptation.ingredientGroups.map((other, index) =>
                              index !== g
                                ? other
                                : {
                                    ...other,
                                    ingredients: [
                                      ...other.ingredients,
                                      {
                                        item: '',
                                        quantity: '',
                                        unit: '',
                                        note: '',
                                        shoppingCategory: 'Other',
                                      },
                                    ],
                                  },
                            ),
                          })
                        }
                      >
                        <Plus size={16} /> Add ingredient
                      </button>
                    </fieldset>
                  ))}
                  {adaptation.instructionSections.map((section, index) => (
                    <label key={index}>
                      {section.title || 'Instructions'}
                      <textarea
                        rows={6}
                        value={section.steps.join('\n\n')}
                        onChange={(event) =>
                          setAdaptation({
                            ...adaptation,
                            instructionSections: adaptation.instructionSections.map((item, i) =>
                              i !== index
                                ? item
                                : { ...item, steps: event.target.value.split(/\n\n/u) },
                            ),
                          })
                        }
                      />
                      <small>Separate steps with a blank line.</small>
                    </label>
                  ))}
                </section>
              ) : null}
            </>
          ) : null}
          <label>
            Notes
            <textarea
              maxLength={240}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy || loading || (adapt && !adaptation)}>
            {busy ? 'Saving…' : entry ? 'Save meal' : 'Add meal'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
