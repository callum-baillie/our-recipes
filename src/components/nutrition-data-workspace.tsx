'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { FoodCatalogPicker } from './food-catalog-picker';
import { NutritionFeedback } from './nutrition-form-fields';
import { useNutritionDraft } from './use-nutrition-draft';
import { useNutritionRequest } from './use-nutrition-request';
import formStyles from './nutrition-dashboard.module.css';
import styles from './nutrition-data-workspace.module.css';
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
export type NutritionDataWorkspaceData = {
  products: Array<{
    id: string;
    displayName: string;
    record: null | {
      id: string;
      revision: number;
      basisType: string;
      basisAmount: number;
      basisUnit: string;
      servingWeightGrams?: number | null;
      densityGramsPerMilliliter?: number | null;
      pieceWeightGrams?: number | null;
      confidence: number;
      completeness: number;
      sourceName: string;
      sourceRecordKey?: string;
      notes?: string;
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
];
type Product = NutritionDataWorkspaceData['products'][number];
type Recipe = NutritionDataWorkspaceData['recipes'][number];
export function NutritionDataWorkspace({
  workspace,
  definitions,
  activeProfileId,
  canManageProfile,
  initialTask,
  initialRecipeId,
  onLog,
}: {
  workspace: NutritionDataWorkspaceData;
  definitions: Definition[];
  activeProfileId: string;
  canManageProfile: boolean;
  initialTask?: string;
  initialRecipeId?: string;
  onLog?: (mode: 'product' | 'recipe' | 'manual', id?: string) => void;
}) {
  const router = useRouter();
  const [task, setTask] = useState(
    initialTask === 'calculate' ? 'calculate' : initialTask === 'product' ? 'product' : 'log',
  );
  const [productId, setProductId] = useState(workspace.products[0]?.id ?? '');
  const [recipeId, setRecipeId] = useState(initialRecipeId ?? workspace.recipes[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const product = workspace.products.find((item) => item.id === productId);
  const recipe = workspace.recipes.find((item) => item.id === recipeId);
  function log(mode: 'product' | 'recipe' | 'manual', id?: string) {
    if (onLog) onLog(mode, id);
    else router.push(`/nutrition?view=diary&log=${mode}`);
  }
  return (
    <section className={styles.workspace} aria-label="Food and nutrition data tasks">
      <header>
        <h2>Food and nutrition data</h2>
        <p>
          Record food, edit a saved label or calculate recipe nutrition. Source changes never record
          consumption.
        </p>
      </header>
      <div className={styles.taskChoices} role="group" aria-label="Nutrition data task">
        {[
          ['log', 'Log food'],
          ['product', 'Edit product nutrition'],
          ['calculate', 'Calculate recipe nutrition'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={task === value}
            disabled={busy}
            onClick={() => setTask(value!)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p className={styles.helper} role="status">
          {notice}
        </p>
      )}
      {task === 'log' ? (
        <div className={styles.task}>
          <p className={styles.helper}>
            Use the same person, date, units and validation as the main Log food action.
          </p>
          <div className={styles.taskChoices}>
            <button type="button" disabled={!canManageProfile} onClick={() => log('product')}>
              Saved food
            </button>
            <button type="button" disabled={!canManageProfile} onClick={() => log('recipe')}>
              Recipe portion
            </button>
            <button type="button" disabled={!canManageProfile} onClick={() => log('manual')}>
              Manual entry
            </button>
          </div>
        </div>
      ) : task === 'product' ? (
        <div className={styles.task}>
          <FoodCatalogPicker
            context="nutrition"
            disabled={busy || !canManageProfile}
            onImported={(item) => {
              setProductId(item.id);
              setNotice('Product imported. Review its saved label before recording any food.');
              router.refresh();
            }}
          />
          <label>
            Saved product
            <select
              value={productId}
              disabled={busy}
              onChange={(event) => setProductId(event.target.value)}
            >
              {workspace.products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </label>
          {product ? (
            <>
              <ProductNutritionEditor
                key={`${activeProfileId}:${product.id}`}
                product={product}
                definitions={definitions}
                profileId={activeProfileId}
                canManage={canManageProfile}
                onBusy={setBusy}
              />
              {product.record && (
                <button
                  type="button"
                  disabled={busy || !canManageProfile}
                  onClick={() => log('product', product.id)}
                >
                  Log a portion of this saved food
                </button>
              )}
            </>
          ) : (
            <p className={styles.helper}>
              No saved product is available. Import or create a product first.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.task}>
          <label>
            Recipe
            <select
              value={recipeId}
              disabled={busy}
              onChange={(event) => setRecipeId(event.target.value)}
            >
              {workspace.recipes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {recipe ? (
            <>
              <RecipeNutritionCalculator
                key={`${activeProfileId}:${recipe.id}`}
                recipe={recipe}
                products={workspace.products}
                definitions={definitions}
                profileId={activeProfileId}
                canManage={canManageProfile}
                onBusy={setBusy}
              />
              {recipe.calculation && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    !canManageProfile ||
                    (!recipe.calculation.servingCount && !recipe.calculation.finalWeightGrams)
                  }
                  onClick={() => log('recipe', recipe.id)}
                >
                  Review and log a recipe portion
                </button>
              )}
            </>
          ) : (
            <p className={styles.helper}>
              No saved recipe is available. <Link href="/recipes">Open recipebook</Link>.
            </p>
          )}
        </div>
      )}
      {!canManageProfile && (
        <p className={styles.helper}>
          This profile is read only; source changes and food recording are unavailable.
        </p>
      )}
    </section>
  );
}
function productDefaults(product: Product): Record<string, string> {
  const record = product.record;
  return {
    basisType: record?.basisType ?? 'per_100g',
    basisAmount: String(record?.basisAmount ?? 100),
    basisUnit: record?.basisUnit ?? 'g',
    servingWeightGrams: record?.servingWeightGrams?.toString() ?? '',
    densityGramsPerMilliliter: record?.densityGramsPerMilliliter?.toString() ?? '',
    pieceWeightGrams: record?.pieceWeightGrams?.toString() ?? '',
    confidence: record?.confidence?.toString() ?? '',
    completeness: record?.completeness?.toString() ?? '',
    sourceRecordKey: record?.sourceRecordKey ?? '',
    notes: record?.notes ?? '',
    expectedRecordId: record?.id ?? '',
    basisChanged: '',
    basisReviewed: '',
    uncertain: '',
    ...Object.fromEntries(
      (record?.values ?? []).map((value) => [
        `nutrient-${value.nutrientCode}`,
        String(value.amount),
      ]),
    ),
  };
}
function ProductNutritionEditor({
  product,
  definitions,
  profileId,
  canManage,
  onBusy,
}: {
  product: Product;
  definitions: Definition[];
  profileId: string;
  canManage: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const defaults = productDefaults(product);
  const { draft, update, clear, notice } = useNutritionDraft(
    `${profileId}:product-record:${product.id}`,
    defaults,
  );
  const request = useNutritionRequest(`${profileId}:product-record:${product.id}`);
  const [qualityOpen, setQualityOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const codes = [
    ...new Set([
      ...conciseCodes,
      ...(product.record?.values ?? []).map((value) => value.nutrientCode),
      ...Object.keys(draft)
        .filter((key) => key.startsWith('nutrient-'))
        .map((key) => key.slice(9)),
    ]),
  ];
  function field(
    name: string,
    label: string,
    options: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) {
    return (
      <label key={name}>
        {label}
        <input
          name={name}
          value={draft[name] ?? ''}
          onChange={(event) => update({ [name]: event.target.value })}
          {...options}
        />
      </label>
    );
  }
  function setBasis(value: string) {
    update({
      basisType: value,
      basisAmount: value === 'per_100g' || value === 'per_100ml' ? '100' : '1',
      basisUnit:
        value === 'per_100g'
          ? 'g'
          : value === 'per_100ml'
            ? 'ml'
            : value === 'per_serving'
              ? 'serving'
              : 'unit',
      basisChanged: value !== product.record?.basisType ? 'yes' : '',
      basisReviewed: '',
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || request.isPending() || draft.uncertain) return;
    const values = codes.flatMap((code) =>
      draft[`nutrient-${code}`]?.trim()
        ? [
            {
              nutrientCode: code,
              amount: Number(draft[`nutrient-${code}`]),
              confidence: null,
              sourceNote: '',
            },
          ]
        : [],
    );
    if (!values.length) {
      request.message(
        'record',
        'error',
        'Enter at least one known nutrient. Blank is unknown and 0 is a known zero.',
      );
      return;
    }
    onBusy(true);
    try {
      const optional = (key: string) => (draft[key]?.trim() ? Number(draft[key]) : null);
      const result = await request.send<{ record: { id: string } }>(
        'record',
        `/api/v1/nutrition/products/${product.id}/records`,
        {
          sourceRecordKey: draft.sourceRecordKey,
          basisType: draft.basisType,
          basisAmount: Number(draft.basisAmount),
          basisUnit: draft.basisUnit,
          servingWeightGrams:
            draft.basisType === 'per_serving' ? optional('servingWeightGrams') : null,
          densityGramsPerMilliliter: optional('densityGramsPerMilliliter'),
          pieceWeightGrams: optional('pieceWeightGrams'),
          confidence: Number(draft.confidence),
          completeness: Number(draft.completeness),
          supersedesRecordId: draft.expectedRecordId || null,
          notes: draft.notes,
          values,
        },
        { pending: 'Saving product label…' },
      );
      if (!result) {
        if (request.isUncertain('record')) update({ uncertain: 'yes' });
        return;
      }
      clear({
        ...draft,
        expectedRecordId: result.record.id,
        uncertain: '',
        basisChanged: '',
        basisReviewed: '',
      });
      request.message(
        'record',
        'success',
        'Product nutrition label saved as a new source revision. No food was logged.',
      );
      router.refresh();
    } finally {
      onBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={save}
      onInvalidCapture={(event) => {
        const input = event.target as HTMLElement;
        const details = input.closest('details');
        if (details) {
          details.open = true;
          setQualityOpen(true);
        }
      }}
    >
      <h3>{product.displayName}</h3>
      <p className={styles.helper}>
        {product.record
          ? `Correcting saved record revision ${product.record.revision}. Known values are prefilled; blank omits a nutrient from the new revision.`
          : 'Add known values from a label or other source. Blank means unknown; zero is a known zero.'}
      </p>
      {notice && <p className={styles.helper}>{notice}</p>}
      {(product.record?.id ?? '') !== draft.expectedRecordId && (
        <div className={formStyles.feedback}>
          <p>
            The preferred source revision changed. Your draft still targets its original version.
          </p>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Replace this draft with the latest saved product record?'))
                clear(productDefaults(product));
            }}
          >
            Load latest saved record
          </button>
        </div>
      )}
      <fieldset
        className={formStyles.formFields}
        disabled={request.pending || !canManage || Boolean(draft.uncertain)}
      >
        <label>
          Nutrition reference
          <select value={draft.basisType} onChange={(event) => setBasis(event.target.value)}>
            <option value="per_100g">Per 100 g</option>
            <option value="per_100ml">Per 100 ml</option>
            <option value="per_serving">Per serving</option>
            <option value="per_unit">Per unit</option>
          </select>
        </label>
        <div className={formStyles.formGrid}>
          {field('basisAmount', 'Reference amount', {
            type: 'number',
            min: 0.000001,
            step: 'any',
            required: true,
            readOnly:
              draft.basisType === 'per_100g' ||
              draft.basisType === 'per_100ml' ||
              draft.basisType === 'per_serving',
          })}
          {field('basisUnit', 'Reference unit', {
            required: true,
            maxLength: 30,
            readOnly: draft.basisType !== 'per_unit',
          })}
        </div>
        {draft.basisChanged && (
          <label className={formStyles.checkRow}>
            <input
              type="checkbox"
              checked={draft.basisReviewed === 'yes'}
              onChange={(event) => update({ basisReviewed: event.target.checked ? 'yes' : '' })}
              required
            />
            I reviewed every nutrient amount for this new reference basis. Values were not
            automatically converted.
          </label>
        )}
        <div className={formStyles.formGrid}>
          {codes.map((code) =>
            field(
              `nutrient-${code}`,
              `${definitions.find((item) => item.code === code)?.displayName ?? code} (${definitions.find((item) => item.code === code)?.canonicalUnit ?? ''})`,
              { type: 'number', min: 0, step: 'any' },
            ),
          )}
        </div>
        <details open={qualityOpen} onToggle={(event) => setQualityOpen(event.currentTarget.open)}>
          <summary className="recipe-disclosure-summary">
            Source quality and conversion evidence
            <ChevronDown size={18} />
          </summary>
          <p className={styles.helper}>
            Use the source’s known quality values (0–1). These describe the data, not health. New
            records require explicit quality values; no score is guessed.
          </p>
          <div className={formStyles.formGrid}>
            {field('confidence', 'Source confidence (0–1)', {
              type: 'number',
              min: 0,
              max: 1,
              step: 'any',
              required: true,
            })}
            {field('completeness', 'Source completeness (0–1)', {
              type: 'number',
              min: 0,
              max: 1,
              step: 'any',
              required: true,
            })}
            {draft.basisType === 'per_serving' &&
              field('servingWeightGrams', 'One recorded serving weighs (g, if known)', {
                type: 'number',
                min: 0.000001,
                step: 'any',
              })}
            {field('densityGramsPerMilliliter', 'Density (g/ml, if known)', {
              type: 'number',
              min: 0.000001,
              step: 'any',
            })}
            {field('pieceWeightGrams', 'One item weighs (g, if known)', {
              type: 'number',
              min: 0.000001,
              step: 'any',
            })}
          </div>
          <p className={styles.helper}>
            Density supports mass/volume conversion; item weight supports count/mass conversion. A
            serving label without serving weight is not automatically convertible.
          </p>
          {field('sourceRecordKey', 'Label/source reference (optional)', { maxLength: 300 })}
          <label>
            Source notes (optional)
            <textarea
              maxLength={2000}
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </label>
        </details>
        <button className={formStyles.primaryAction} type="submit">
          {request.busyTask === 'record'
            ? 'Saving label…'
            : product.record
              ? 'Save corrected label revision'
              : 'Save nutrition label'}
        </button>
      </fieldset>
      <NutritionFeedback value={request.feedback.record} />
      {draft.uncertain && (
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Check the saved product record before retrying. Refresh with this draft retained?',
              )
            ) {
              update({ uncertain: '' });
              window.location.reload();
            }
          }}
        >
          Refresh after checking saved source
        </button>
      )}
    </form>
  );
}
function RecipeNutritionCalculator({
  recipe,
  products,
  definitions,
  profileId,
  canManage,
  onBusy,
}: {
  recipe: Recipe;
  products: Product[];
  definitions: Definition[];
  profileId: string;
  canManage: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const { draft, update, notice } = useNutritionDraft<Record<string, string>>(
    `${profileId}:calculate:${recipe.id}`,
    {
      finalWeightGrams: '',
      uncertain: '',
      ...Object.fromEntries(
        (recipe.ingredients ?? [])
          .filter((item) => item.isOptional)
          .map((item) => [
            `include-${item.id}`,
            recipe.calculation?.contributions.find(
              (contribution) => contribution.recipeIngredientId === item.id,
            )?.optionalIncluded
              ? 'yes'
              : '',
          ]),
      ),
    },
  );
  const request = useNutritionRequest(`${profileId}:calculate:${recipe.id}`);
  const calculation = recipe.calculation;
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || request.isPending() || draft.uncertain) return;
    onBusy(true);
    try {
      const ingredients = recipe.ingredients ?? [];
      const optional = (key: string) => (draft[key]?.trim() ? Number(draft[key]) : null);
      const result = await request.send(
        'calculate',
        `/api/v1/nutrition/recipes/${recipe.id}/calculations`,
        {
          includedOptionalIngredientIds: ingredients
            .filter((item) => draft[`include-${item.id}`] === 'yes')
            .map((item) => item.id),
          excludedIngredientIds: ingredients
            .filter((item) => draft[`exclude-${item.id}`] === 'yes')
            .map((item) => item.id),
          substitutions: ingredients.flatMap((item) =>
            draft[`substitute-${item.id}`]
              ? [{ recipeIngredientId: item.id, productId: draft[`substitute-${item.id}`] }]
              : [],
          ),
          preparationFactors: ingredients.flatMap((item) => {
            const edible = optional(`edible-${item.id}`),
              drained = optional(`drained-${item.id}`),
              note = draft[`evidence-${item.id}`]?.trim() ?? '';
            return edible !== null || drained !== null || note
              ? [
                  {
                    recipeIngredientId: item.id,
                    ediblePortion: edible ?? 1,
                    drainedYield: drained ?? 1,
                    evidenceNote: note,
                  },
                ]
              : [];
          }),
          finalWeightGrams: optional('finalWeightGrams'),
        },
        { pending: 'Calculating recipe nutrition…' },
      );
      if (result) {
        request.message(
          'calculate',
          'success',
          'Recipe calculation saved. Review the snapshot before logging any food; no consumption was recorded.',
        );
        router.refresh();
      } else if (request.isUncertain('calculate')) update({ uncertain: 'yes' });
    } finally {
      onBusy(false);
    }
  }
  return (
    <div className={styles.calculation}>
      <form className={styles.form} onSubmit={calculate}>
        <h3>{recipe.title}</h3>
        <p className={styles.helper}>
          Current recipe revision {recipe.currentRevision} · yield {recipe.servings}. Calculating
          creates a new snapshot; existing food history is preserved.
        </p>
        {notice && <p className={styles.helper}>{notice}</p>}
        <fieldset
          className={formStyles.formFields}
          disabled={request.pending || !canManage || Boolean(draft.uncertain)}
        >
          <details>
            <summary className="recipe-disclosure-summary">
              Ingredient preparation and substitutions
              <ChevronDown size={18} />
            </summary>
            <p className={styles.helper}>
              Optional ingredients are excluded unless included. Add only known factors; no density,
              cooking loss or retention is assumed.
            </p>
            {(recipe.ingredients ?? []).map((item) => (
              <details key={item.id} className={styles.ingredient}>
                <summary className="recipe-disclosure-summary">
                  <span>
                    {item.quantity ?? 'Unknown amount'} {item.unit} {item.item}
                    {item.isOptional ? ' · optional' : ''}
                  </span>
                  <ChevronDown size={16} />
                </summary>
                {item.isOptional && (
                  <label className={formStyles.checkRow}>
                    <input
                      type="checkbox"
                      checked={draft[`include-${item.id}`] === 'yes'}
                      onChange={(event) =>
                        update({ [`include-${item.id}`]: event.target.checked ? 'yes' : '' })
                      }
                    />
                    Include optional ingredient
                  </label>
                )}
                <label className={formStyles.checkRow}>
                  <input
                    type="checkbox"
                    checked={draft[`exclude-${item.id}`] === 'yes'}
                    onChange={(event) =>
                      update({ [`exclude-${item.id}`]: event.target.checked ? 'yes' : '' })
                    }
                  />
                  Exclude from this preparation
                </label>
                <label>
                  Substitute saved product
                  <select
                    value={draft[`substitute-${item.id}`] ?? ''}
                    onChange={(event) => update({ [`substitute-${item.id}`]: event.target.value })}
                  >
                    <option value="">Use mapped product</option>
                    {products
                      .filter((product) => product.record)
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.displayName}
                        </option>
                      ))}
                  </select>
                </label>
                <div className={formStyles.formGrid}>
                  {[
                    ['edible', 'Edible portion'],
                    ['drained', 'Drained yield'],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label} (0–1, optional)
                      <input
                        type="number"
                        min="0.000001"
                        max="1"
                        step="any"
                        value={draft[`${key}-${item.id}`] ?? ''}
                        onChange={(event) => update({ [`${key}-${item.id}`]: event.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Evidence note (required with factors)
                  <input
                    maxLength={500}
                    value={draft[`evidence-${item.id}`] ?? ''}
                    required={Boolean(draft[`edible-${item.id}`] || draft[`drained-${item.id}`])}
                    onChange={(event) => update({ [`evidence-${item.id}`]: event.target.value })}
                  />
                </label>
              </details>
            ))}
          </details>
          <label>
            Final cooked weight (g, optional)
            <input
              type="number"
              min="0.000001"
              step="any"
              value={draft.finalWeightGrams}
              onChange={(event) => update({ finalWeightGrams: event.target.value })}
            />
          </label>
          <button className={formStyles.primaryAction} type="submit">
            {request.busyTask === 'calculate'
              ? 'Calculating…'
              : 'Calculate current recipe nutrition'}
          </button>
        </fieldset>
        <NutritionFeedback value={request.feedback.calculate} />
        {draft.uncertain && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm('Check whether a calculation saved before refreshing and retrying.')
              ) {
                update({ uncertain: '' });
                window.location.reload();
              }
            }}
          >
            Refresh after checking calculations
          </button>
        )}
      </form>
      {calculation ? (
        <section className={styles.result}>
          <h4>Saved calculation {calculation.revision}</h4>
          <p className={styles.helper}>
            Recipe revision {calculation.recipeRevision} ·{' '}
            {Math.round(calculation.completeness * 100)}% coverage ·{' '}
            {Math.round(calculation.confidence * 100)}% confidence · {calculation.source.name}.{' '}
            {calculation.recipeRevision !== recipe.currentRevision
              ? 'This calculation is for an older recipe revision.'
              : ''}
          </p>
          <dl className={styles.valueGrid}>
            {calculation.values.map((value) => (
              <div key={value.nutrientCode}>
                <dt>
                  {definitions.find((item) => item.code === value.nutrientCode)?.displayName ??
                    value.nutrientCode}
                </dt>
                <dd>
                  {Number(value.amount.toFixed(2))}{' '}
                  {definitions.find((item) => item.code === value.nutrientCode)?.canonicalUnit} per
                  recipe
                  {calculation.servingCount
                    ? ` · ${Number((value.amount / calculation.servingCount).toFixed(2))} per serving`
                    : ''}
                  {calculation.finalWeightGrams
                    ? ` · ${Number(((value.amount / calculation.finalWeightGrams) * 100).toFixed(2))} per 100 g`
                    : ''}
                </dd>
              </div>
            ))}
          </dl>
          {calculation.warnings.length > 0 && (
            <details>
              <summary className="recipe-disclosure-summary">
                Calculation notes ({calculation.warnings.length})<ChevronDown size={18} />
              </summary>
              <ul>
                {calculation.warnings.map((warning, index) => (
                  <li key={`${index}:${warning}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          <p className={styles.helper}>
            {calculation.servingCount
              ? `${calculation.servingCount} servings defined.`
              : 'Serving count unavailable.'}
            {calculation.finalWeightGrams
              ? ` Final weight ${calculation.finalWeightGrams} g.`
              : ' Weighed portions need a known final weight.'}
          </p>
        </section>
      ) : (
        <p className={styles.helper}>No ingredient-based calculation saved for this recipe yet.</p>
      )}
    </div>
  );
}
