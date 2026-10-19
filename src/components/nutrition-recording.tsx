'use client';

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  ClipboardCopy,
  CircleSlash2,
  NotebookTabs,
  Scale,
  Search,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AppDialog } from './app-dialog';
import { NutritionEventFields, NutritionFeedback } from './nutrition-form-fields';
import { useNutritionDraft } from './use-nutrition-draft';
import { useNutritionRequest } from './use-nutrition-request';
import { createClientUuid } from '@/lib/client/client-uuid';
import { bodyMetricFields, bodyMetricsSchema, bodyMetricsError } from '@/lib/domain/body-metrics';
import {
  ingredientFoodRecordMultiplier,
  type FoodRecordBasis,
} from '@/lib/domain/nutrition-recipe-calculation';
import {
  nutritionEventInstant,
  supportedFoodUnits,
  POUNDS_PER_KILOGRAM,
} from '@/lib/domain/nutrition-ui';
import type { ProfileSummary, NutrientDefinition } from './nutrition-dashboard';
import type { NutritionDataWorkspaceData } from './nutrition-data-workspace';
import styles from './nutrition-dashboard.module.css';

export type NutritionRecordMode =
  'choose' | 'product' | 'recipe' | 'manual' | 'skipped' | 'copy' | 'weight';
export const RECORD_TITLES: Record<NutritionRecordMode, string> = {
  choose: 'What would you like to record?',
  product: 'Log a saved food',
  recipe: 'Log a recipe portion',
  manual: 'Add a manual entry',
  skipped: 'Record a skipped meal',
  copy: 'Copy a diary day',
  weight: 'Record weight',
};
const RECORD_HELP: Record<NutritionRecordMode, string> = {
  choose: 'Choose a record type. Food, skipped meals and weight keep separate histories.',
  product: 'Choose from saved foods with nutrition records. Logging does not change Pantry stock.',
  recipe: 'Record a portion from a saved calculation. A prepared batch is not required.',
  manual:
    'Enter the total nutrition for the entire amount consumed. Blank means unknown; zero is a known zero.',
  skipped:
    'Adds a skipped diary record without nutrients. Existing food and planner meals stay unchanged.',
  copy: 'Append eligible eaten or corrected entries with their saved portions and nutrient snapshots.',
  weight: 'Record a dated private observation. Goals and tracking preferences are not changed.',
};
const nutrientCodes = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'total_fat',
  'saturated_fat',
  'fiber',
  'total_sugars',
  'sodium',
];
function basis(
  record: NonNullable<NutritionDataWorkspaceData['products'][number]['record']>,
): FoodRecordBasis {
  return {
    ...record,
    basisType: record.basisType as FoodRecordBasis['basisType'],
    servingWeightGrams: record.servingWeightGrams ?? null,
    densityGramsPerMilliliter: record.densityGramsPerMilliliter ?? null,
    pieceWeightGrams: record.pieceWeightGrams ?? null,
  };
}
type RecordContext = {
  profile: ProfileSummary;
  profiles: ProfileSummary[];
  date: string;
  today: string;
  definitions: NutrientDefinition[];
  workspace: NutritionDataWorkspaceData;
  onSaved?: (message: string, date: string) => void;
  onBusy?: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
  onMode?: (mode: NutritionRecordMode) => void;
  inline?: boolean;
  selectedId?: string;
};

export function NutritionRecordingDialog({
  open,
  mode,
  onMode,
  onClose,
  returnFocusRef,
  ...context
}: RecordContext & {
  open: boolean;
  mode: NutritionRecordMode;
  onMode: (mode: NutritionRecordMode) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  function dismiss() {
    if (busy) return;
    if (
      dirty &&
      !window.confirm(
        'Close this form? Your draft is kept in this browser tab; nothing is saved to Nutrition until you submit.',
      )
    )
      return;
    setDirty(false);
    onClose();
  }
  function changeMode(next: NutritionRecordMode) {
    if (busy) return;
    setDirty(false);
    onMode(next);
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }
  if (!open) return null;
  return (
    <AppDialog
      className={styles.recordDialog}
      aria-labelledby="nutrition-log-dialog-title"
      onClose={dismiss}
      returnFocusRef={returnFocusRef}
    >
      <header className={styles.dialogHeader}>
        <div>
          <h2 id="nutrition-log-dialog-title" ref={titleRef} tabIndex={-1}>
            {RECORD_TITLES[mode]}
          </h2>
          <p>
            {context.profile.displayName} · {context.date}
          </p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close record nutrition dialog"
          disabled={busy}
          onClick={dismiss}
        >
          <X size={20} />
        </button>
      </header>
      {mode === 'choose' ? (
        <div className={styles.dialogBody}>
          <p className={styles.helper}>{RECORD_HELP.choose}</p>
          <div className={styles.logOptions}>
            {(
              [
                [
                  'product',
                  Search,
                  'Food or packaged item',
                  'Use a saved food with nutrition data.',
                ],
                [
                  'recipe',
                  Utensils,
                  'Recipe or meal',
                  'Use a calculated recipe and a supported portion.',
                ],
                [
                  'manual',
                  NotebookTabs,
                  'Manual diary entry',
                  'Record known nutrients for the full amount.',
                ],
                ['skipped', CircleSlash2, 'Skipped meal', 'Add history without nutrient values.'],
                [
                  'copy',
                  ClipboardCopy,
                  'Copy a diary day',
                  'Append saved entries from another date.',
                ],
                ...(context.profile.weightTrackingEnabled
                  ? [['weight', Scale, 'Weight check-in', 'Record a dated private measurement']]
                  : []),
              ] as Array<[NutritionRecordMode, LucideIcon, string, string]>
            ).map(([kind, Icon, label, help]) => (
              <button
                type="button"
                key={String(kind)}
                disabled={!context.profile.canManageProfile}
                onClick={() => changeMode(kind as NutritionRecordMode)}
              >
                <Icon size={22} aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <NutritionRecordForm
          key={`${context.profile.id}:${mode}:${context.date}`}
          {...context}
          mode={mode}
          onMode={changeMode}
          onBusy={setBusy}
          onDirty={setDirty}
        />
      )}
    </AppDialog>
  );
}

export function NutritionRecordForm({
  mode,
  profile,
  profiles,
  date,
  today,
  definitions,
  workspace,
  onSaved,
  onBusy,
  onDirty,
  onMode,
  inline = false,
  selectedId,
}: RecordContext & { mode: Exclude<NutritionRecordMode, 'choose'> }) {
  const router = useRouter();
  const products = workspace.products.filter((product) => product.record);
  const recipes = workspace.recipes.filter(
    (recipe) =>
      recipe.calculation &&
      (recipe.calculation.servingCount || recipe.calculation.finalWeightGrams),
  );
  const firstProduct = products.find((product) => product.id === selectedId) ?? products[0];
  const firstRecipe = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0];
  const initialUnit = firstProduct?.record
    ? (supportedFoodUnits(basis(firstProduct.record))[0] ?? '')
    : '';
  const yesterday = new Date(`${date}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const defaults: Record<string, string> = {
    date,
    time: '',
    occurrence: '',
    mealSlot: mode === 'recipe' || mode === 'skipped' ? 'dinner' : 'snack',
    productId: firstProduct?.id ?? '',
    recipeId: firstRecipe?.id ?? '',
    quantity: mode === 'manual' ? '1' : '',
    unit: mode === 'manual' ? 'portion' : initialUnit,
    sourceName: '',
    portionBasis: firstRecipe?.calculation?.servingCount ? 'servings' : 'weight',
    servingCount: '1',
    portionWeightGrams: '',
    weight: '',
    weightUnit: profile.measurementSystem === 'imperial' ? 'lb' : 'kg',
    note: '',
    approximate: '',
    sourceDate: yesterday.toISOString().slice(0, 10),
    targetDate: date,
    targetProfileId: profile.id,
    operationId: '',
    uncertain: '',
  };
  const { draft, update, clear, notice, dirty } = useNutritionDraft(
    `${profile.id}:${mode}:${date}:${selectedId ?? ''}`,
    defaults,
  );
  const request = useNutritionRequest(`${profile.id}:${mode}:${date}`);
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  const [search, setSearch] = useState('');
  const [savedDestination, setSavedDestination] = useState<{
    date: string;
    profileId: string;
  } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const task = mode;
  const selectedProduct = products.find((product) => product.id === draft.productId);
  const selectedRecipe = recipes.find((recipe) => recipe.id === draft.recipeId);
  const calculation = selectedRecipe?.calculation;
  const units = selectedProduct?.record ? supportedFoodUnits(basis(selectedProduct.record)) : [];
  const conversion =
    selectedProduct?.record && draft.quantity
      ? ingredientFoodRecordMultiplier(
          Number(draft.quantity),
          draft.unit ?? '',
          basis(selectedProduct.record),
        )
      : null;
  const target = profiles.find((item) => item.id === draft.targetProfileId);
  const timeZone = profile.dailyResetTimezone ?? 'UTC';
  const maintenanceHref = `/nutrition?view=diary&task=${mode === 'recipe' ? 'calculate' : 'product'}&returnLog=${mode}&date=${encodeURIComponent(date)}${mode === 'recipe' && selectedRecipe ? `&recipe=${encodeURIComponent(selectedRecipe.id)}` : ''}#nutrition-data-tools`;
  function change(patch: Record<string, string | undefined>) {
    update({
      ...Object.fromEntries(
        Object.entries(patch).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ),
      operationId: '',
    });
    onDirty?.(true);
  }
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
          onChange={(event) => change({ [name]: event.target.value })}
          {...options}
        />
      </label>
    );
  }
  function switchWeightUnit(next: string) {
    const factor =
      next === draft.weightUnit ? 1 : next === 'lb' ? POUNDS_PER_KILOGRAM : 1 / POUNDS_PER_KILOGRAM;
    const keys = [
      'weight',
      ...bodyMetricFields.filter((field) => field.unit === 'kg').map((field) => field.key),
    ];
    change({
      weightUnit: next,
      ...Object.fromEntries(
        keys
          .filter((key) => draft[key]?.trim())
          .map((key) => [key, String(Number((Number(draft[key]) * factor).toFixed(8)))]),
      ),
    });
  }
  function invalidateMeasurement(name: string, message: string) {
    setAdvancedOpen(true);
    request.message(task, 'error', message);
    window.requestAnimationFrame(() => {
      const input = formRef.current?.elements.namedItem(name);
      if (input instanceof HTMLElement) input.focus();
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.canManageProfile || request.isPending() || (draft.uncertain && mode !== 'copy'))
      return;
    onBusy?.(true);
    try {
      let endpoint = `/api/v1/nutrition/profiles/${profile.id}/`;
      let body: Record<string, unknown>;
      if (mode === 'copy') {
        if (
          draft.sourceDate === draft.targetDate &&
          draft.targetProfileId === profile.id &&
          !window.confirm(
            'Append another copy to this same diary day? Existing entries remain and the copied food will count again.',
          )
        )
          return;
        const key = draft.operationId || createClientUuid();
        update({ operationId: key });
        endpoint += 'diary-commands';
        body = {
          command: 'copy_day',
          sourceDate: draft.sourceDate,
          targetDate: draft.targetDate,
          targetProfileId: draft.targetProfileId,
          idempotencyKey: key,
        };
      } else {
        const instant = nutritionEventInstant(draft.date!, draft.time!, timeZone, draft.occurrence);
        const common = { occurredAt: instant, mealSlot: draft.mealSlot };
        if (mode === 'product') {
          if (!selectedProduct?.record || !conversion?.supported)
            throw new Error(
              conversion && !conversion.supported
                ? conversion.missingReason
                : 'Choose an amount and a supported unit for this saved food.',
            );
          endpoint += 'intake/product';
          body = {
            ...common,
            productId: selectedProduct.id,
            quantity: Number(draft.quantity),
            unit: draft.unit,
          };
        } else if (mode === 'recipe') {
          if (!calculation)
            throw new Error('Choose a recipe calculation with a supported portion basis.');
          endpoint += 'intake/recipe';
          body = {
            ...common,
            recipeCalculationId: calculation.id,
            servingCount: draft.portionBasis === 'servings' ? Number(draft.servingCount) : null,
            portionWeightGrams:
              draft.portionBasis === 'weight' ? Number(draft.portionWeightGrams) : null,
          };
        } else if (mode === 'manual') {
          const values = nutrientCodes.flatMap((code) =>
            draft[`manual-${code}`]?.trim()
              ? [{ nutrientCode: code, amount: Number(draft[`manual-${code}`]) }]
              : [],
          );
          if (!values.length)
            throw new Error(
              'Enter at least one known nutrient. Leave unknown values blank; enter 0 only for a known zero.',
            );
          endpoint += 'intake/manual';
          body = {
            ...common,
            sourceName: draft.sourceName,
            quantity: Number(draft.quantity),
            unit: draft.unit,
            values,
          };
        } else if (mode === 'skipped') {
          endpoint += 'intake';
          body = { ...common, state: 'skipped', sourceType: 'manual' };
        } else {
          const divisor = draft.weightUnit === 'lb' ? POUNDS_PER_KILOGRAM : 1;
          const weightKilograms = Number(draft.weight) / divisor;
          const metrics = Object.fromEntries(
            bodyMetricFields.flatMap((metric) =>
              draft[metric.key]?.trim()
                ? [[metric.key, Number(draft[metric.key]) / (metric.unit === 'kg' ? divisor : 1)]]
                : [],
            ),
          );
          const valid = bodyMetricsSchema.safeParse(metrics);
          if (!valid.success) {
            invalidateMeasurement(
              String(valid.error.issues[0]?.path[0] ?? 'weight'),
              valid.error.issues[0]?.message ?? 'Check this measurement.',
            );
            return;
          }
          const problem = bodyMetricsError(valid.data, weightKilograms);
          if (problem) {
            const name =
              bodyMetricFields.find(
                (metric) => metric.unit === 'kg' && metrics[metric.key] > weightKilograms,
              )?.key ?? 'weight';
            invalidateMeasurement(name, problem);
            return;
          }
          endpoint += 'measurements';
          body = {
            measuredAt: instant,
            weightKilograms,
            advancedMetrics: valid.data,
            sourceType: 'manual',
            approximate: draft.approximate === 'yes',
            note: draft.note,
          };
        }
      }
      const result = await request.send<{
        result?: { revisionIds?: string[] };
        replayed?: boolean;
      }>(task, endpoint, body, {
        replay: mode === 'copy',
        pending:
          mode === 'copy'
            ? 'Copying confirmed entries…'
            : mode === 'weight'
              ? 'Saving observation…'
              : 'Recording…',
      });
      if (!result) {
        if (request.isUncertain(task)) update({ uncertain: 'yes' });
        return;
      }
      const count = result.result?.revisionIds?.length ?? 0;
      const savedDate = mode === 'copy' ? draft.targetDate! : draft.date!;
      const message =
        mode === 'copy'
          ? count
            ? `${count} ${count === 1 ? 'entry' : 'entries'} copied to ${target?.displayName ?? 'the selected person'} · ${savedDate}. Existing entries remain.`
            : 'No eligible eaten or corrected entries were found. Nothing was copied; choose another source day.'
          : mode === 'weight'
            ? `Weight recorded for ${profile.displayName} · ${savedDate}.`
            : mode === 'skipped'
              ? `${draft.mealSlot} recorded as skipped for ${profile.displayName} · ${savedDate}. No nutrients were added.`
              : `Food logged for ${profile.displayName} · ${savedDate}.`;
      request.message(task, 'success', message);
      setSavedDestination({
        date: savedDate,
        profileId: mode === 'copy' ? draft.targetProfileId! : profile.id,
      });
      if (mode !== 'copy' || count) {
        clear();
        onDirty?.(false);
        onSaved?.(message, savedDate);
      }
      router.refresh();
    } catch (error) {
      request.message(
        task,
        'error',
        error instanceof Error ? error.message : 'Check the entered values.',
      );
    } finally {
      onBusy?.(false);
    }
  }
  const unavailable =
    (mode === 'product' && !products.length) || (mode === 'recipe' && !recipes.length);
  const buttonText =
    mode === 'copy'
      ? 'Copy confirmed entries'
      : mode === 'weight'
        ? 'Save weight observation'
        : mode === 'skipped'
          ? 'Record skipped meal'
          : 'Add to food diary';
  return (
    <form
      ref={formRef}
      className={`${styles.recordForm} ${inline ? styles.inlineForm : ''}`}
      onSubmit={submit}
      onClickCapture={(event) => {
        if (request.isPending() && (event.target as Element).closest('a[href]')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onInvalidCapture={(event) => {
        const target = event.target as HTMLElement;
        const details = target.closest('details');
        if (details) {
          setAdvancedOpen(true);
          details.open = true;
        }
      }}
      aria-busy={request.pending}
    >
      <div className={styles.dialogBody}>
        {onMode && (
          <button
            type="button"
            className={styles.textButton}
            disabled={request.pending}
            onClick={() => {
              onDirty?.(false);
              onMode('choose');
            }}
          >
            ← All record types
          </button>
        )}
        {inline && <h3>{RECORD_TITLES[mode]}</h3>}
        <p className={styles.helper}>
          {profile.displayName} · {mode === 'copy' ? draft.targetDate : draft.date}.{' '}
          {RECORD_HELP[mode]}
        </p>
        {notice && (
          <p className={styles.helper} role="status">
            {notice}
          </p>
        )}
        {unavailable ? (
          <div className={styles.emptyState}>
            <h3>
              {mode === 'recipe'
                ? 'No calculated recipes have a usable portion basis'
                : 'No saved foods with nutrition data'}
            </h3>
            <p>
              {mode === 'recipe'
                ? 'Calculate nutrition with a serving count or final cooked weight, then return to this draft.'
                : 'Add or correct a saved product’s nutrition data, then return here.'}
            </p>
            <Link className="inline-link" href={maintenanceHref}>
              Open {mode === 'recipe' ? 'recipe calculation' : 'product nutrition'} tools
            </Link>
            {onMode && (
              <button type="button" onClick={() => onMode('manual')}>
                Use a manual entry
              </button>
            )}
          </div>
        ) : (
          <fieldset
            className={styles.formFields}
            disabled={request.pending || !profile.canManageProfile || Boolean(draft.uncertain)}
          >
            {mode === 'product' && (
              <>
                {products.length > 8 && (
                  <label>
                    Find saved food
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search saved foods"
                    />
                    <small>
                      {
                        products.filter((product) =>
                          product.displayName
                            .toLocaleLowerCase()
                            .includes(search.toLocaleLowerCase()),
                        ).length
                      }{' '}
                      matching saved foods
                    </small>
                  </label>
                )}
                <label>
                  Saved food
                  <select
                    value={draft.productId}
                    onChange={(event) => {
                      const record = products.find(
                        (product) => product.id === event.target.value,
                      )?.record;
                      change({
                        productId: event.target.value,
                        quantity: '',
                        unit: record ? (supportedFoodUnits(basis(record))[0] ?? '') : '',
                      });
                    }}
                  >
                    {products
                      .filter(
                        (product) =>
                          product.id === draft.productId ||
                          product.displayName
                            .toLocaleLowerCase()
                            .includes(search.toLocaleLowerCase()),
                      )
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.displayName}
                        </option>
                      ))}
                  </select>
                </label>
                {selectedProduct?.record && (
                  <div className={styles.identity}>
                    <strong>{selectedProduct.displayName}</strong>
                    <span>
                      Reference: {selectedProduct.record.basisAmount}{' '}
                      {selectedProduct.record.basisUnit} · {selectedProduct.record.sourceName} ·
                      revision {selectedProduct.record.revision}
                    </span>
                    <small>
                      {Math.round(selectedProduct.record.completeness * 100)}% recorded nutrient
                      coverage. Package size and the amount eaten are separate.
                    </small>
                    {selectedProduct.record.basisType === 'per_serving' && (
                      <small>
                        {selectedProduct.record.servingWeightGrams
                          ? `One recorded serving weighs ${selectedProduct.record.servingWeightGrams} g; enter a supported mass or volume.`
                          : 'Serving-weight evidence is missing; correct the record before logging.'}
                      </small>
                    )}
                  </div>
                )}
                <div className={styles.formGrid}>
                  {field('quantity', 'Amount consumed', {
                    type: 'number',
                    min: 0.000001,
                    step: 'any',
                    required: true,
                  })}
                  <label>
                    Unit
                    <select
                      value={units.includes(draft.unit!) ? draft.unit : ''}
                      onChange={(event) => change({ unit: event.target.value })}
                      required
                    >
                      <option value="">Choose unit</option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {draft.unit && !units.includes(draft.unit) && (
                  <p className={styles.helper} role="status">
                    The saved draft unit “{draft.unit}” is not supported by this food record. Choose
                    a supported unit and review the amount before logging.
                  </p>
                )}
                {!units.length && (
                  <p className={styles.helper}>
                    This record needs conversion evidence before it can be used.{' '}
                    <Link href={maintenanceHref}>Review product nutrition</Link>
                  </p>
                )}
                {conversion?.supported && selectedProduct?.record && (
                  <p className={styles.helper}>
                    For this amount:{' '}
                    {selectedProduct.record.values
                      .slice(0, 4)
                      .map(
                        (value) =>
                          `${Number((value.amount * conversion.multiplier).toFixed(2))} ${definitions.find((definition) => definition.code === value.nutrientCode)?.canonicalUnit ?? ''} ${definitions.find((definition) => definition.code === value.nutrientCode)?.displayName ?? value.nutrientCode}`,
                      )
                      .join(' · ')}
                    . Unprovided nutrients remain unknown.
                  </p>
                )}
              </>
            )}
            {mode === 'recipe' && (
              <>
                <label>
                  Recipe
                  <select
                    value={draft.recipeId}
                    onChange={(event) => {
                      const next = recipes.find(
                        (recipe) => recipe.id === event.target.value,
                      )?.calculation;
                      change({
                        recipeId: event.target.value,
                        portionBasis: next?.servingCount ? 'servings' : 'weight',
                        portionWeightGrams: '',
                        servingCount: '1',
                      });
                    }}
                  >
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.title}
                      </option>
                    ))}
                  </select>
                </label>
                {calculation && (
                  <div className={styles.identity}>
                    <strong>{selectedRecipe?.title}</strong>
                    <span>
                      Calculation {calculation.revision} · recipe revision{' '}
                      {calculation.recipeRevision} · {Math.round(calculation.completeness * 100)}%
                      nutrient coverage
                    </span>
                    <small>
                      {calculation.servingCount
                        ? `${calculation.servingCount} servings per calculated recipe.`
                        : 'No unambiguous serving count; use a weighed portion.'}
                      {calculation.finalWeightGrams
                        ? ` Calculated batch weight ${calculation.finalWeightGrams} g.`
                        : ''}
                    </small>
                    {calculation.recipeRevision !== selectedRecipe?.currentRevision && (
                      <p>
                        This is an older recipe snapshot.{' '}
                        <Link href={maintenanceHref}>Review the current calculation</Link> before
                        recording if needed.
                      </p>
                    )}
                    {calculation.warnings.length > 0 && (
                      <details>
                        <summary className="recipe-disclosure-summary">
                          Calculation notes <ChevronDown size={16} />
                        </summary>
                        <ul>
                          {calculation.warnings.map((warning, index) => (
                            <li key={`${index}:${warning}`}>{warning}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                <label>
                  Portion basis
                  <select
                    value={draft.portionBasis}
                    onChange={(event) => change({ portionBasis: event.target.value })}
                  >
                    {calculation?.servingCount ? (
                      <option value="servings">Serving count</option>
                    ) : null}
                    {calculation?.finalWeightGrams ? (
                      <option value="weight">Weighed portion (g)</option>
                    ) : null}
                  </select>
                </label>
                {draft.portionBasis === 'weight'
                  ? field('portionWeightGrams', 'Amount consumed (g)', {
                      type: 'number',
                      min: 0.000001,
                      step: 'any',
                      required: true,
                    })
                  : field('servingCount', 'Servings eaten', {
                      type: 'number',
                      min: 0.000001,
                      step: 'any',
                      required: true,
                    })}
              </>
            )}
            {mode === 'manual' && (
              <>
                {field('sourceName', 'Food or meal name', { maxLength: 300, required: true })}
                <div className={styles.formGrid}>
                  {field('quantity', 'Amount consumed', {
                    type: 'number',
                    min: 0.000001,
                    step: 'any',
                    required: true,
                  })}
                  {field('unit', 'Unit', { maxLength: 30, required: true })}
                </div>
                <fieldset className={styles.nutrientFields}>
                  <legend>
                    Total nutrition for {draft.quantity || 'the entered amount'}{' '}
                    {draft.unit || 'consumed'}
                  </legend>
                  <p className={styles.helper}>
                    Values apply to the entire amount above and are not multiplied. If you change
                    the amount, review these totals.
                  </p>
                  <div className={styles.formGrid}>
                    {nutrientCodes.map((code) =>
                      field(
                        `manual-${code}`,
                        `${definitions.find((definition) => definition.code === code)?.displayName ?? code} (${definitions.find((definition) => definition.code === code)?.canonicalUnit ?? ''})`,
                        { type: 'number', min: 0, step: 'any' },
                      ),
                    )}
                  </div>
                </fieldset>
              </>
            )}
            {mode === 'copy' ? (
              <>
                <p>
                  <strong>Source: {profile.displayName}</strong>
                </p>
                {field('sourceDate', 'Source date', { type: 'date', max: today, required: true })}
                <label>
                  Destination person
                  <select
                    value={draft.targetProfileId}
                    onChange={(event) => change({ targetProfileId: event.target.value })}
                  >
                    {profiles
                      .filter((person) => person.canManageProfile)
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName}
                        </option>
                      ))}
                  </select>
                </label>
                {field('targetDate', 'Destination date', {
                  type: 'date',
                  max: today,
                  required: true,
                })}
                <div className={styles.identity}>
                  Copy {profile.displayName}’s {draft.sourceDate} entries to{' '}
                  {target?.displayName ?? 'the selected person'} · {draft.targetDate}. Existing
                  entries remain; copied food adds to that day’s totals. Saved portions and nutrient
                  snapshots are retained.
                </div>
                <details>
                  <summary className="recipe-disclosure-summary">
                    Copy timing details
                    <ChevronDown size={16} />
                  </summary>
                  <p className={styles.helper}>
                    Saved local meal times transfer from {timeZone} to{' '}
                    {target?.dailyResetTimezone ?? timeZone}; nutrients are not recalculated.
                    Repeated clock times use the earlier occurrence. A nonexistent clock time needs
                    another date or individual copying.
                  </p>
                </details>
              </>
            ) : (
              <>
                {mode === 'weight' && (
                  <>
                    <div className={styles.formGrid}>
                      {field('weight', `Weight (${draft.weightUnit})`, {
                        type: 'number',
                        min: 0.000001,
                        max: 1000 * (draft.weightUnit === 'lb' ? POUNDS_PER_KILOGRAM : 1),
                        step: 'any',
                        required: true,
                      })}
                      <label>
                        Observation unit
                        <select
                          value={draft.weightUnit}
                          onChange={(event) => switchWeightUnit(event.target.value)}
                        >
                          <option value="kg">Kilograms (kg)</option>
                          <option value="lb">Pounds (lb)</option>
                        </select>
                      </label>
                    </div>
                    <p className={styles.helper}>
                      Changing unit converts entered mass values. This profile displays weight in{' '}
                      {profile.measurementSystem === 'imperial' ? 'lb' : 'kg'}.
                    </p>
                  </>
                )}
                <NutritionEventFields
                  draft={{
                    date: draft.date!,
                    time: draft.time!,
                    occurrence: draft.occurrence!,
                    mealSlot: draft.mealSlot,
                  }}
                  update={change}
                  timeZone={timeZone}
                  today={today}
                  measurement={mode === 'weight'}
                />
                {mode === 'weight' && (
                  <>
                    {field('note', 'Note (optional)', { maxLength: 500 })}
                    <details
                      open={advancedOpen}
                      onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
                    >
                      <summary className="recipe-disclosure-summary">
                        Additional measurements (optional)
                        <ChevronDown size={18} />
                      </summary>
                      <div className={styles.formGrid}>
                        {bodyMetricFields.map((metric) =>
                          field(
                            metric.key,
                            `${metric.label} (${metric.unit === 'kg' ? draft.weightUnit : metric.unit})`,
                            {
                              type: 'number',
                              min: ['kg', 'years', 'kcal/day'].includes(metric.unit) ? 0.000001 : 0,
                              max:
                                metric.max *
                                (metric.unit === 'kg' && draft.weightUnit === 'lb'
                                  ? POUNDS_PER_KILOGRAM
                                  : 1),
                              step: 'any',
                              inputMode: 'decimal',
                              'aria-description': metric.help,
                            },
                          ),
                        )}
                      </div>
                    </details>
                    <label className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={draft.approximate === 'yes'}
                        onChange={(event) =>
                          change({ approximate: event.target.checked ? 'yes' : '' })
                        }
                      />
                      This is an approximate observation
                    </label>
                  </>
                )}
              </>
            )}
          </fieldset>
        )}
        {!profile.canManageProfile && (
          <p className={styles.helper}>
            This profile is read only. Recording and changes are unavailable.
          </p>
        )}
        <span className="sr-only">{dirty ? 'Unsaved draft' : ''}</span>
      </div>
      <footer className={styles.dialogFooter}>
        <NutritionFeedback value={request.feedback[task]}>
          {request.feedback[task]?.phase === 'success' &&
            savedDestination &&
            savedDestination.profileId === profile.id && (
              <Link
                className="inline-link"
                href={
                  mode === 'weight'
                    ? '/nutrition?view=trends'
                    : `/nutrition?view=diary&date=${encodeURIComponent(savedDestination!.date)}`
                }
              >
                {mode === 'weight' ? 'View weight trend' : 'View diary day'}
              </Link>
            )}
        </NutritionFeedback>
        {savedDestination && savedDestination.profileId !== profile.id && (
          <p className={styles.helper}>
            To view the destination diary, switch to{' '}
            {profiles.find((item) => item.id === savedDestination.profileId)?.displayName ??
              'that person'}{' '}
            in the app header, then open {savedDestination.date} in Food diary.
          </p>
        )}
        {draft.uncertain && (
          <>
            <Link className="inline-link" href="/nutrition?view=diary" target="_blank">
              Check saved diary in a new tab
            </Link>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Only continue after checking whether the earlier request saved. This starts a new request.',
                  )
                ) {
                  clear();
                  window.location.reload();
                }
              }}
            >
              Start fresh after checking
            </button>
          </>
        )}
        {!unavailable && (
          <button
            className={styles.primaryAction}
            type="submit"
            disabled={
              request.pending ||
              !profile.canManageProfile ||
              (Boolean(draft.uncertain) && mode !== 'copy') ||
              (mode === 'product' && !units.length)
            }
          >
            {request.pending
              ? mode === 'copy'
                ? 'Copying…'
                : 'Saving…'
              : draft.uncertain && mode === 'copy'
                ? 'Retry same copy'
                : buttonText}
          </button>
        )}
      </footer>
    </form>
  );
}
