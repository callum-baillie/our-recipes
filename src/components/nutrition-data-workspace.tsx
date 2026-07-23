'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import styles from '@/components/nutrition-data-workspace.module.css';
import { FoodCatalogPicker } from '@/components/food-catalog-picker';

type Definition = { code: string; displayName: string; canonicalUnit: string };
type Calculation = {
  id: string;
  recipeRevision: number;
  revision: number;
  servingCount: number | null;
  finalWeightGrams?: number | null;
  servingWeightGrams?: number | null;
  confidence: number;
  completeness: number;
  energyMethod: string;
  warnings: string[];
  createdAt: string;
  values: Array<{
    nutrientCode: string;
    amount: number;
    confidence: number | null;
    completeness: number | null;
    perServing?: number | null;
    per100g?: number | null;
  }>;
  contributions: Array<{
    recipeIngredientId: string | null;
    optionalIncluded: boolean;
    missingReason: string;
  }>;
  source: { name: string; provider: string; version: string };
};
type Workspace = {
  products: Array<{
    id: string;
    displayName: string;
    record: null | {
      id: string;
      revision: number;
      basisType: string;
      basisAmount: number;
      basisUnit: string;
      confidence: number;
      completeness: number;
      sourceName: string;
      values: Array<{ nutrientCode: string; amount: number }>;
    };
  }>;
  recipes: Array<{
    id: string;
    title: string;
    servings: string;
    currentRevision: number;
    ingredients?: Array<{
      id: string;
      item: string;
      quantity: number | null;
      unit: string;
      mappedProductId: string | null;
      isOptional: boolean;
    }>;
    calculation: Calculation | null;
  }>;
};

const conciseCodes = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'total_fat',
  'saturated_fat',
  'fiber',
  'total_sugars',
  'sodium',
] as const;

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? 'Nutrition could not save this change.';
}

function optionalNumber(data: FormData, name: string) {
  const value = String(data.get(name) ?? '').trim();
  return value ? Number(value) : null;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function NutritionDataWorkspace({
  workspace,
  definitions,
  activeProfileId,
  canManageProfile,
}: {
  workspace: Workspace;
  definitions: Definition[];
  activeProfileId: string;
  canManageProfile: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [productId, setProductId] = useState(workspace.products[0]?.id ?? '');
  const [recipeId, setRecipeId] = useState(workspace.recipes[0]?.id ?? '');
  const selectedProduct = workspace.products.find((item) => item.id === productId) ?? null;
  const selectedRecipe = workspace.recipes.find((item) => item.id === recipeId) ?? null;
  const definitionByCode = useMemo(
    () => new Map(definitions.map((definition) => [definition.code, definition])),
    [definitions],
  );

  async function submit(url: string, body: unknown) {
    setStatus('Saving…');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setStatus(await responseMessage(response));
      return false;
    }
    setStatus('Saved.');
    router.refresh();
    return true;
  }

  async function saveFoodRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = conciseCodes.flatMap((nutrientCode) => {
      const raw = String(data.get(`nutrient-${nutrientCode}`) ?? '').trim();
      return raw ? [{ nutrientCode, amount: Number(raw), confidence: null, sourceNote: '' }] : [];
    });
    const basisType = String(data.get('basisType'));
    if (
      await submit(`/api/v1/nutrition/products/${selectedProduct.id}/records`, {
        sourceRecordKey: String(data.get('sourceRecordKey') ?? ''),
        basisType,
        basisAmount: Number(data.get('basisAmount')),
        basisUnit: String(data.get('basisUnit')),
        servingWeightGrams:
          basisType === 'per_serving' ? optionalNumber(data, 'servingWeightGrams') : null,
        densityGramsPerMilliliter: optionalNumber(data, 'densityGramsPerMilliliter'),
        pieceWeightGrams:
          basisType === 'per_unit' ? optionalNumber(data, 'pieceWeightGrams') : null,
        confidence: Number(data.get('confidence')),
        completeness: Number(data.get('completeness')),
        supersedesRecordId: selectedProduct.record?.id ?? null,
        notes: String(data.get('notes') ?? ''),
        values,
      })
    ) {
      form.reset();
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecipe) return;
    const data = new FormData(event.currentTarget);
    const ingredients = selectedRecipe.ingredients ?? [];
    await submit(`/api/v1/nutrition/recipes/${selectedRecipe.id}/calculations`, {
      includedOptionalIngredientIds: ingredients
        .filter((ingredient) => data.get(`include-${ingredient.id}`) === 'on')
        .map((ingredient) => ingredient.id),
      excludedIngredientIds: ingredients
        .filter((ingredient) => data.get(`exclude-${ingredient.id}`) === 'on')
        .map((ingredient) => ingredient.id),
      substitutions: ingredients.flatMap((ingredient) => {
        const productId = String(data.get(`substitute-${ingredient.id}`) ?? '');
        return productId ? [{ recipeIngredientId: ingredient.id, productId }] : [];
      }),
      preparationFactors: ingredients.flatMap((ingredient) => {
        const ediblePortion = optionalNumber(data, `edible-${ingredient.id}`);
        const drainedYield = optionalNumber(data, `drained-${ingredient.id}`);
        const evidenceNote = String(data.get(`evidence-${ingredient.id}`) ?? '').trim();
        return ediblePortion !== null || drainedYield !== null || evidenceNote
          ? [
              {
                recipeIngredientId: ingredient.id,
                ediblePortion: ediblePortion ?? 1,
                drainedYield: drainedYield ?? 1,
                evidenceNote,
              },
            ]
          : [];
      }),
      finalWeightGrams: optionalNumber(data, 'finalWeightGrams'),
    });
  }

  async function logProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await submit(`/api/v1/nutrition/profiles/${activeProfileId}/intake/product`, {
      productId: selectedProduct.id,
      quantity: Number(data.get('quantity')),
      unit: data.get('unit'),
      occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
      mealSlot: data.get('mealSlot'),
    });
  }

  async function logManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = conciseCodes.flatMap((nutrientCode) => {
      const raw = String(data.get(`manual-${nutrientCode}`) ?? '').trim();
      return raw ? [{ nutrientCode, amount: Number(raw) }] : [];
    });
    if (
      await submit(`/api/v1/nutrition/profiles/${activeProfileId}/intake/manual`, {
        sourceName: data.get('sourceName'),
        quantity: Number(data.get('quantity')),
        unit: data.get('unit'),
        occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
        mealSlot: data.get('mealSlot'),
        values,
      })
    ) {
      form.reset();
    }
  }

  async function logRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecipe?.calculation) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const portionBasis = String(data.get('portionBasis'));
    await submit(`/api/v1/nutrition/profiles/${activeProfileId}/intake/recipe`, {
      recipeCalculationId: selectedRecipe.calculation.id,
      servingCount: portionBasis === 'serving' ? Number(data.get('servingCount')) : null,
      portionWeightGrams: portionBasis === 'weight' ? Number(data.get('portionWeightGrams')) : null,
      occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
      mealSlot: data.get('mealSlot'),
    });
  }

  const calculation = selectedRecipe?.calculation ?? null;

  return (
    <section className={styles.workspace} aria-labelledby="nutrition-data-heading">
      <header>
        <p className={styles.eyebrow}>Recipe nutrition workspace</p>
        <h2 id="nutrition-data-heading">Source, calculate, then confirm</h2>
        <p>
          Product labels create immutable source revisions. Recipe calculations use mapped
          ingredients and supported conversion evidence. Nothing enters the Food Diary until you
          explicitly confirm a portion.
        </p>
      </header>

      <div className={styles.columns}>
        <section className={styles.card}>
          <h3>1. Product nutrition record</h3>
          <FoodCatalogPicker
            context="nutrition"
            disabled={!canManageProfile}
            onImported={(product) => {
              setProductId(product.id);
              setStatus('Provider product added. Set a portion before confirming intake.');
              router.refresh();
            }}
          />
          <label>
            Pantry product
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              {workspace.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.displayName}
                </option>
              ))}
            </select>
          </label>
          {selectedProduct?.record ? (
            <p className={styles.quality}>
              Revision {selectedProduct.record.revision} · {selectedProduct.record.basisAmount}{' '}
              {selectedProduct.record.basisUnit} · coverage{' '}
              {formatPercent(selectedProduct.record.completeness)} ·{' '}
              {selectedProduct.record.sourceName}
            </p>
          ) : (
            <p className={styles.warning}>
              No nutrition record. Recipe coverage will remain partial.
            </p>
          )}
          <form className={styles.form} onSubmit={saveFoodRecord}>
            <div className={styles.inlineFields}>
              <label>
                Reference
                <select name="basisType" defaultValue="per_100g">
                  <option value="per_100g">Per 100 g</option>
                  <option value="per_100ml">Per 100 ml</option>
                  <option value="per_serving">Per serving</option>
                  <option value="per_unit">Per unit</option>
                </select>
              </label>
              <label>
                Amount
                <input
                  name="basisAmount"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue="100"
                  required
                />
              </label>
              <label>
                Unit
                <input name="basisUnit" defaultValue="g" maxLength={30} required />
              </label>
            </div>
            <div className={styles.inlineFields}>
              <label>
                Serving weight (g)
                <input name="servingWeightGrams" type="number" min="0.000001" step="any" />
              </label>
              <label>
                Density (g/ml)
                <input name="densityGramsPerMilliliter" type="number" min="0.000001" step="any" />
              </label>
              <label>
                Piece weight (g)
                <input name="pieceWeightGrams" type="number" min="0.000001" step="any" />
              </label>
            </div>
            <div className={styles.nutrients}>
              {conciseCodes.map((code) => {
                const definition = definitionByCode.get(code);
                return (
                  <label key={code}>
                    {definition?.displayName ?? code} ({definition?.canonicalUnit ?? ''})
                    <input name={`nutrient-${code}`} type="number" min="0" step="any" />
                  </label>
                );
              })}
            </div>
            <div className={styles.inlineFields}>
              <label>
                Confidence (0–1)
                <input
                  name="confidence"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue="0.8"
                  required
                />
              </label>
              <label>
                Completeness (0–1)
                <input
                  name="completeness"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue="0.75"
                  required
                />
              </label>
            </div>
            <label>
              Label/source reference
              <input
                name="sourceRecordKey"
                maxLength={300}
                placeholder="Package label date or lot"
              />
            </label>
            <label>
              Assumptions or notes
              <textarea name="notes" maxLength={2000} />
            </label>
            <button type="submit" disabled={!selectedProduct}>
              {selectedProduct?.record ? 'Save corrected revision' : 'Save nutrition record'}
            </button>
          </form>
          <form className={styles.form} onSubmit={logProduct}>
            <h4>Confirm this product in the Food Diary</h4>
            <div className={styles.inlineFields}>
              <label>
                Quantity
                <input name="quantity" type="number" min="0.000001" step="any" required />
              </label>
              <label>
                Unit
                <input name="unit" maxLength={30} required />
              </label>
              <label>
                When
                <input name="occurredAt" type="datetime-local" required />
              </label>
              <label>
                Meal
                <select name="mealSlot" defaultValue="snack">
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={!canManageProfile || !selectedProduct?.record}>
              Confirm product portion
            </button>
          </form>
        </section>

        <section className={styles.card}>
          <h3>2. Recipe calculation</h3>
          <form className={styles.form} onSubmit={calculate}>
            <label>
              Recipe
              <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
                {workspace.recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title} · serves {recipe.servings}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.help}>
              Optional ingredients are excluded unless checked. Exclusions, substitutions, edible
              portions, and drained yields are explicit preparation evidence. Final weight changes
              concentration only. No cooking loss or nutrient retention is guessed.
            </p>
            {(selectedRecipe?.ingredients ?? []).length > 0 ? (
              <fieldset className={styles.preparationGrid}>
                <legend>Ingredient preparation</legend>
                {(selectedRecipe?.ingredients ?? []).map((ingredient) => (
                  <details key={ingredient.id}>
                    <summary>
                      {ingredient.quantity ?? '—'} {ingredient.unit} {ingredient.item}
                      {ingredient.isOptional ? ' (optional)' : ''}
                    </summary>
                    <div className={styles.inlineFields}>
                      {ingredient.isOptional ? (
                        <label>
                          <input name={`include-${ingredient.id}`} type="checkbox" /> Include
                        </label>
                      ) : null}
                      <label>
                        <input name={`exclude-${ingredient.id}`} type="checkbox" /> Exclude from
                        this preparation
                      </label>
                      <label>
                        Substitute Pantry product
                        <select name={`substitute-${ingredient.id}`} defaultValue="">
                          <option value="">Use mapped product</option>
                          {workspace.products
                            .filter((product) => product.record)
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.displayName}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className={styles.inlineFields}>
                      <label>
                        Edible portion (0–1)
                        <input
                          name={`edible-${ingredient.id}`}
                          type="number"
                          min="0.000001"
                          max="1"
                          step="any"
                          placeholder="1"
                        />
                      </label>
                      <label>
                        Drained yield (0–1)
                        <input
                          name={`drained-${ingredient.id}`}
                          type="number"
                          min="0.000001"
                          max="1"
                          step="any"
                          placeholder="1"
                        />
                      </label>
                      <label>
                        Evidence note (required with factors)
                        <input name={`evidence-${ingredient.id}`} maxLength={500} />
                      </label>
                    </div>
                  </details>
                ))}
              </fieldset>
            ) : null}
            <label>
              Final cooked weight (g)
              <input name="finalWeightGrams" type="number" min="0.000001" step="any" />
            </label>
            <button type="submit" disabled={!selectedRecipe}>
              Calculate current recipe revision
            </button>
          </form>

          {calculation ? (
            <div className={styles.calculation}>
              <p className={styles.quality}>
                Calculation revision {calculation.revision} for recipe revision{' '}
                {calculation.recipeRevision} · coverage {formatPercent(calculation.completeness)} ·
                confidence {formatPercent(calculation.confidence)} · {calculation.energyMethod}
              </p>
              <dl className={styles.valueGrid}>
                {calculation.values
                  .filter((value) =>
                    conciseCodes.includes(value.nutrientCode as (typeof conciseCodes)[number]),
                  )
                  .map((value) => {
                    const definition = definitionByCode.get(value.nutrientCode);
                    const perServing =
                      value.perServing ??
                      (calculation.servingCount ? value.amount / calculation.servingCount : null);
                    const per100g =
                      value.per100g ??
                      (calculation.finalWeightGrams
                        ? (value.amount / calculation.finalWeightGrams) * 100
                        : null);
                    return (
                      <div key={value.nutrientCode}>
                        <dt>{definition?.displayName ?? value.nutrientCode}</dt>
                        <dd>
                          {Number(value.amount.toFixed(2))} {definition?.canonicalUnit} total
                          {perServing === null
                            ? ' · per serving unavailable'
                            : ` · ${Number(perServing.toFixed(2))} ${definition?.canonicalUnit} per serving`}
                          {per100g === null
                            ? ' · per 100 g unavailable'
                            : ` · ${Number(per100g.toFixed(2))} ${definition?.canonicalUnit} per 100 g`}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
              {calculation.warnings.length > 0 ? (
                <ul className={styles.warningList}>
                  {calculation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <p className={styles.help}>
                Raw-ingredient estimate from {calculation.source.name}. Existing calculation and
                consumed history remain immutable when sources change.
              </p>
              <form className={styles.form} onSubmit={logRecipe}>
                <h4>3. Confirm consumption</h4>
                <div className={styles.inlineFields}>
                  <label>
                    Portion basis
                    <select name="portionBasis" defaultValue="serving">
                      <option value="serving">Servings</option>
                      <option value="weight">Weighed portion</option>
                    </select>
                  </label>
                  <label>
                    Servings eaten
                    <input
                      name="servingCount"
                      type="number"
                      min="0.01"
                      step="any"
                      defaultValue="1"
                    />
                  </label>
                  <label>
                    Portion weight (g)
                    <input name="portionWeightGrams" type="number" min="0.000001" step="any" />
                  </label>
                  <label>
                    When
                    <input name="occurredAt" type="datetime-local" required />
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
                </div>
                <button
                  type="submit"
                  disabled={
                    !canManageProfile ||
                    (calculation.servingCount === null && calculation.finalWeightGrams == null)
                  }
                >
                  Confirm recipe in Food Diary
                </button>
              </form>
            </div>
          ) : (
            <p className={styles.warning}>No normalized calculation exists for this recipe.</p>
          )}
        </section>

        <section className={styles.card}>
          <h3>Manual Food Diary entry</h3>
          <p className={styles.help}>
            Use this only when no recipe or product record applies. Values are labeled manual,
            estimated, and moderate-confidence by the server.
          </p>
          <form className={styles.form} onSubmit={logManual}>
            <label>
              Food or meal name
              <input name="sourceName" maxLength={300} required />
            </label>
            <div className={styles.inlineFields}>
              <label>
                Portion amount
                <input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                Portion unit
                <input name="unit" defaultValue="portion" maxLength={30} required />
              </label>
              <label>
                When
                <input name="occurredAt" type="datetime-local" required />
              </label>
              <label>
                Meal
                <select name="mealSlot" defaultValue="snack">
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <div className={styles.nutrients}>
              {conciseCodes.map((code) => {
                const definition = definitionByCode.get(code);
                return (
                  <label key={code}>
                    {definition?.displayName ?? code} ({definition?.canonicalUnit ?? ''})
                    <input name={`manual-${code}`} type="number" min="0" step="any" />
                  </label>
                );
              })}
            </div>
            <button type="submit" disabled={!canManageProfile}>
              Save manual consumed portion
            </button>
          </form>
        </section>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
