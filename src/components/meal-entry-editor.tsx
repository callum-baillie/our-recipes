'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, Trash2, X } from 'lucide-react';
import { ButtonSpinner, InlineSkeleton } from '@/components/skeleton';
import { mealTypeLabel, type MealType } from './meal-planner-types';
import { comparePlannedMeals } from '@/lib/domain/meal-plan-policy';
import { parseMealPlanIngredientSnapshot } from '@/lib/domain/meal-plan-snapshot';
import type { MealPlanOptionInput } from '@/lib/domain/planning';
import type { RecipePayload } from '@/lib/domain/recipe';
import type { PlannedMeal } from '@/lib/services/planning-service';
import type { RecipeDetail } from '@/lib/services/recipe-service';
import styles from './meal-entry-editor.module.css';

type Adaptation = Pick<
  RecipePayload,
  'title' | 'summary' | 'servings' | 'ingredientGroups' | 'instructionSections'
>;

type PantryProductOption = { id: string; displayName: string };

function parseMealOptions(value?: string | null): MealPlanOptionInput[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): MealPlanOptionInput[] => {
      if (typeof item !== 'object' || item === null) return [];
      const option = item as Record<string, unknown>;
      if (typeof option.label !== 'string') return [];
      if (option.kind === 'recipe' && typeof option.recipeId === 'string')
        return [{ kind: 'recipe', recipeId: option.recipeId, label: option.label }];
      if (option.kind === 'pantry' && typeof option.productId === 'string')
        return [{ kind: 'pantry', productId: option.productId, label: option.label }];
      return [];
    });
  } catch {
    return [];
  }
}

export function MealEntryEditor({
  entry,
  initialKind,
  recipes,
  profiles = [],
  initialProfileIds = [],
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
  recipes: Array<{ id: string; title: string }>;
  profiles?: Array<{ id: string; displayName: string }>;
  initialProfileIds?: string[];
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
  const [sourceMealsLoaded, setSourceMealsLoaded] = useState(kind !== 'leftover');
  const [plannedFor, setDate] = useState(entry?.plannedFor ?? date);
  const [meal, setMeal] = useState(entry?.meal ?? slot);
  const [title, setTitle] = useState(entry?.title || entry?.recipeTitle || '');
  const [portionCount, setPortions] = useState(entry?.servings ?? Math.max(1, servings));
  const [note, setNote] = useState(entry?.note ?? '');
  const [profileIds, setProfileIds] = useState<string[]>(() =>
    entry?.profileIds ? JSON.parse(entry.profileIds) : initialProfileIds,
  );
  const [sourceId, setSource] = useState(entry?.leftoverSourceId ?? '');
  const [options, setOptions] = useState<MealPlanOptionInput[]>(() =>
    parseMealOptions(entry?.options),
  );
  const [optionSearch, setOptionSearch] = useState('');
  const [pantryProducts, setPantryProducts] = useState<PantryProductOption[]>([]);
  const [pantryProductsLoaded, setPantryProductsLoaded] = useState(false);
  const loadingPantryProducts = kind === 'options' && !pantryProductsLoaded;
  const loadingSourceMeals = kind === 'leftover' && !sourceMealsLoaded;
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
  const normalizedOptionQuery = optionSearch.trim().toLocaleLowerCase();
  const matchingRecipes = useMemo(
    () =>
      normalizedOptionQuery
        ? recipes
            .filter((recipe) => recipe.title.toLocaleLowerCase().includes(normalizedOptionQuery))
            .slice(0, 8)
        : recipes.slice(0, 8),
    [normalizedOptionQuery, recipes],
  );
  const matchingPantryProducts = useMemo(
    () =>
      normalizedOptionQuery
        ? pantryProducts
            .filter((product) =>
              product.displayName.toLocaleLowerCase().includes(normalizedOptionQuery),
            )
            .slice(0, 8)
        : pantryProducts.slice(0, 8),
    [normalizedOptionQuery, pantryProducts],
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (kind !== 'options' || pantryProductsLoaded) return;
    let active = true;
    void fetch('/api/v1/pantry/summary')
      .then(async (response) => {
        if (!response.ok) throw new Error('Pantry items could not be loaded.');
        const body = (await response.json()) as {
          dashboard?: { products?: Array<{ id?: unknown; displayName?: unknown }> };
        };
        if (!active) return;
        setPantryProducts(
          (body.dashboard?.products ?? []).flatMap((product) =>
            typeof product.id === 'string' && typeof product.displayName === 'string'
              ? [{ id: product.id, displayName: product.displayName }]
              : [],
          ),
        );
      })
      .catch(() => {
        if (active) setError('Pantry items could not be loaded. You can still add recipe options.');
      })
      .finally(() => {
        if (active) setPantryProductsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [kind, pantryProductsLoaded]);
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
      })
      .finally(() => {
        if (active) setSourceMealsLoaded(true);
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

  function addRecipeOption(recipe: { id: string; title: string }) {
    setOptions((current) =>
      current.some((option) => option.kind === 'recipe' && option.recipeId === recipe.id)
        ? current
        : [...current, { kind: 'recipe', recipeId: recipe.id, label: recipe.title }],
    );
  }

  function addPantryOption(product: PantryProductOption) {
    setOptions((current) =>
      current.some((option) => option.kind === 'pantry' && option.productId === product.id)
        ? current
        : [...current, { kind: 'pantry', productId: product.id, label: product.displayName }],
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (kind === 'options' && options.length < 2) {
      setError('Choose at least two recipes or Pantry items.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const selectedSource = sourceMeals.find((item) => item.id === sourceId);
      const payload = {
        plannedFor,
        profileIds,
        meal,
        kind,
        title:
          kind === 'leftover'
            ? (selectedSource?.recipeTitle ?? title)
            : kind === 'fast'
              ? 'Fasting'
              : kind === 'options'
                ? options
                    .map((option) => option.label)
                    .join(' or ')
                    .slice(0, 160)
                : title,
        ...(kind === 'options' ? { options } : {}),
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
          {profiles.length > 0 && (
            <fieldset>
              <legend>Who is this meal for?</legend>
              <p>
                Leave everyone unselected for a shared household meal. Add separate entries in the
                same slot for different meals.
              </p>
              {profiles.map((profile) => (
                <label
                  key={profile.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '.6rem', minHeight: 44 }}
                >
                  <input
                    type="checkbox"
                    checked={profileIds.includes(profile.id)}
                    onChange={(event) =>
                      setProfileIds((current) =>
                        event.target.checked
                          ? [...current, profile.id]
                          : current.filter((id) => id !== profile.id),
                      )
                    }
                  />
                  {profile.displayName}
                </label>
              ))}
            </fieldset>
          )}
          <div className={styles.row}>
            <label>
              Date
              <input
                required
                type="date"
                value={plannedFor}
                onChange={(event) => {
                  setDate(event.target.value);
                  if (kind === 'leftover') setSourceMealsLoaded(false);
                }}
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
            <select
              value={kind}
              onChange={(event) => {
                const nextKind = event.target.value;
                setKind(nextKind);
                if (nextKind === 'leftover') setSourceMealsLoaded(false);
              }}
            >
              {entry?.recipeId ? <option value="recipe">Recipe</option> : null}
              <option value="item">Single food or drink</option>
              <option value="options">Options · choose one</option>
              <option value="fast">Fast · no meal</option>
              <option value="takeout">Eating out</option>
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
                  disabled={loadingSourceMeals}
                  aria-busy={loadingSourceMeals}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="">
                    {loadingSourceMeals ? 'Loading earlier meals…' : 'Choose the original meal'}
                  </option>
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
          ) : kind === 'options' ? (
            <section className={styles.optionsPicker} aria-label="Meal alternatives">
              <p>Choose the recipes or Pantry items that can each stand in for this meal.</p>
              <label className={styles.optionSearch}>
                <Search size={18} aria-hidden="true" />
                <input
                  value={optionSearch}
                  onChange={(event) => setOptionSearch(event.target.value)}
                  placeholder="Search recipes and Pantry items"
                  aria-label="Search recipes and Pantry items"
                />
              </label>
              {options.length ? (
                <div className={styles.selectedOptions} aria-label="Selected alternatives">
                  {options.map((option, index) => (
                    <div
                      className={styles.selectedOption}
                      key={`${option.kind}:${option.kind === 'recipe' ? option.recipeId : option.productId}`}
                    >
                      {index ? <span className={styles.optionOr}>or</span> : null}
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.kind === 'recipe' ? 'Recipe' : 'Pantry item'}</small>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${option.label}`}
                        onClick={() =>
                          setOptions((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.optionsEmpty}>No alternatives selected yet.</p>
              )}
              <div className={styles.optionResults}>
                <section>
                  <h3>Recipes</h3>
                  {matchingRecipes.length ? (
                    matchingRecipes.map((recipe) => {
                      const selected = options.some(
                        (option) => option.kind === 'recipe' && option.recipeId === recipe.id,
                      );
                      return (
                        <button
                          key={recipe.id}
                          type="button"
                          disabled={selected}
                          onClick={() => addRecipeOption(recipe)}
                        >
                          <span>{recipe.title}</span>
                          {selected ? <Check size={16} /> : <Plus size={16} />}
                        </button>
                      );
                    })
                  ) : (
                    <p>No matching recipes.</p>
                  )}
                </section>
                <section>
                  <h3>Pantry items</h3>
                  {matchingPantryProducts.length ? (
                    matchingPantryProducts.map((product) => {
                      const selected = options.some(
                        (option) => option.kind === 'pantry' && option.productId === product.id,
                      );
                      return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={selected}
                          onClick={() => addPantryOption(product)}
                        >
                          <span>{product.displayName}</span>
                          {selected ? <Check size={16} /> : <Plus size={16} />}
                        </button>
                      );
                    })
                  ) : (
                    <p>
                      {loadingPantryProducts ? (
                        <>
                          Loading Pantry items{' '}
                          <InlineSkeleton label="Loading Pantry options" width="4rem" />
                        </>
                      ) : pantryProducts.length ? (
                        'No matching Pantry items.'
                      ) : (
                        'No Pantry items available.'
                      )}
                    </p>
                  )}
                </section>
              </div>
              <p className={styles.optionsHint}>
                These are alternatives. The planner won’t add every choice to your shopping list.
              </p>
            </section>
          ) : kind === 'fast' ? (
            <section className={styles.fastNotice}>
              <strong>Fast</strong>
              <span>
                Use this for a fasting period or any other reason you’re not having a meal.
              </span>
            </section>
          ) : (
            <label>
              {kind === 'takeout' ? 'Restaurant or meal name' : 'Meal or food name'}
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
                      ? 'e.g. Saffron Indian Kitchen'
                      : ''
                }
              />
            </label>
          )}
          <div className={styles.row}>
            <label>
              {kind === 'fast' ? 'People fasting' : 'Servings'}
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
              {loading ? (
                <p role="status">
                  Loading recipe <InlineSkeleton label="Loading original recipe" width="4rem" />
                </p>
              ) : null}
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
              placeholder={kind === 'fast' ? 'Optional details' : ''}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy || loading || (adapt && !adaptation)}>
            {busy ? <ButtonSpinner /> : null}
            {busy ? 'Saving…' : entry ? 'Save meal' : 'Add meal'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
