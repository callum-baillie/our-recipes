'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, Minus, Plus, Save, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { LoadingIndicator } from '@/components/skeleton';
import { FoodCatalogPicker } from '@/components/food-catalog-picker';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ingredientIdentityChanged } from '@/lib/domain/ingredient-identity';
import { createClientUuid } from '@/lib/client/client-uuid';
import { restoreRecipeDraft } from '@/lib/domain/recipe-draft';
import { AppDialog } from './app-dialog';
import './recipe-editor.css';

import {
  emptyRecipeInput,
  joinRecipeTaxonomyValues,
  parseRecipeTaxonomyValues,
  RECIPE_CATEGORY_OPTIONS,
  RECIPE_CUISINE_OPTIONS,
  recipeInputSchema,
  recipeUpdateInputSchema,
  type RecipeInput,
  type RecipePayload,
} from '@/lib/domain/recipe';
import { useToast } from '@/components/toast-provider';
import { RecipeTagSelector } from '@/components/recipe-tag-selector';
import { RecipeTaxonomySelector } from '@/components/recipe-taxonomy-selector';
import type { AiRecipeCandidate } from '@/lib/domain/ai';
import { SHOPPING_CATEGORIES } from '@/lib/domain/list-settings';

type FormValues = RecipePayload & { equipmentText: string };
const recipeFormSchema = recipeInputSchema.extend({
  equipmentText: z.string(),
});

function recipePayloadFromForm(values: FormValues): RecipePayload {
  return recipeInputSchema.parse({
    ...values,
    equipment: values.equipmentText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

function fieldLabel(name: string): string {
  const ingredient = /^ingredientGroups\.(\d+)\.ingredients\.(\d+)\.(\w+)$/u.exec(name);
  if (ingredient)
    return `Ingredient ${Number(ingredient[1]) + 1}-${Number(ingredient[2]) + 1}: ${ingredient[3] === 'item' ? 'name' : ingredient[3] === 'shoppingCategory' ? 'shopping category' : ingredient[3]}`;
  const step = /^instructionSections\.(\d+)\.steps\.(\d+)$/u.exec(name);
  if (step) return `Method section ${Number(step[1]) + 1}, step ${Number(step[2]) + 1}`;
  const labels: Record<string, string> = {
    title: 'Recipe name',
    servings: 'Serves',
    prepMinutes: 'Prep minutes',
    cookMinutes: 'Cook minutes',
    restMinutes: 'Rest minutes',
    sourceUrl: 'Source URL',
    sourceName: 'Source name',
    originalAuthor: 'Original author',
    cookingMethod: 'Cooking method',
    equipmentText: 'Equipment',
    ingredientGroups: 'Ingredients',
    instructionSections: 'Method',
  };
  return (
    labels[name] ??
    name
      .replace(/^nutrition/u, 'Nutrition: ')
      .replace(/([a-z])([A-Z])/gu, '$1 $2')
      .replaceAll('.', ' › ')
  );
}

type RecipeFormProps = {
  initial?: RecipeInput;
  recipeId?: string;
  currentRevision?: number;
  confirmationLabel?: string;
  intro?: ReactNode;
  linkedFoods?: Record<string, string>;
};

function IngredientGroupEditor({
  form,
  groupIndex,
  onMove,
  onRemove,
  isFirst,
  isLast,
  linkedFoods = {},
  acknowledgedLinks,
  acknowledgeLink,
}: {
  linkedFoods?: Record<string, string>;
  acknowledgedLinks: Array<{ pantryProductId: string; item: string }>;
  acknowledgeLink: (pantryProductId: string, item: string) => void;
  form: UseFormReturn<FormValues>;
  groupIndex: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const ingredients = useFieldArray({
    control: form.control,
    name: `ingredientGroups.${groupIndex}.ingredients` as const,
  });
  const rows = useWatch({
    control: form.control,
    name: `ingredientGroups.${groupIndex}.ingredients` as const,
  });
  const [linkedNames, setLinkedNames] = useState<Record<string, string>>({});
  return (
    <fieldset className="editor-group">
      <legend>Ingredient section {groupIndex + 1}</legend>
      <div className="editor-group-heading">
        <label>
          <span>
            Section title <em>(optional)</em>
          </span>
          <input
            {...form.register(`ingredientGroups.${groupIndex}.name` as const)}
            placeholder="e.g. For the soup"
          />
        </label>
        {!(isFirst && isLast) && (
          <div
            className="reorder-actions"
            aria-label={`Ingredient section ${groupIndex + 1} order`}
          >
            <button
              className="icon-button"
              type="button"
              disabled={isFirst}
              onClick={() => onMove(groupIndex, groupIndex - 1)}
              aria-label={`Move ingredient section ${groupIndex + 1} up`}
            >
              <ChevronUp size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={isLast}
              onClick={() => onMove(groupIndex, groupIndex + 1)}
              aria-label={`Move ingredient section ${groupIndex + 1} down`}
            >
              <ChevronDown size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={isFirst && isLast}
              onClick={() => {
                if (
                  !rows.some((row) => row.item.trim()) ||
                  window.confirm('Remove this ingredient section and its contents?')
                )
                  onRemove();
              }}
              aria-label={`Remove ingredient section ${groupIndex + 1}`}
            >
              <Minus size={16} />
            </button>
          </div>
        )}
      </div>
      {ingredients.fields.map((field, ingredientIndex) => (
        <div className="ingredient-row" key={field.id}>
          <span className="ingredient-row-number">Ingredient {ingredientIndex + 1}</span>
          <input
            aria-label={`Ingredient ${groupIndex + 1}-${ingredientIndex + 1} quantity`}
            inputMode="decimal"
            placeholder="Qty"
            {...form.register(
              `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.quantity` as const,
            )}
          />
          <input
            aria-label={`Ingredient ${groupIndex + 1}-${ingredientIndex + 1} unit`}
            placeholder="Unit"
            {...form.register(
              `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.unit` as const,
            )}
          />
          <input
            aria-label={`Ingredient ${groupIndex + 1}-${ingredientIndex + 1} item`}
            placeholder="Ingredient"
            {...form.register(
              `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.item` as const,
            )}
          />
          <details className="ingredient-row-details">
            <summary>
              Details{' '}
              <small>
                {rows?.[ingredientIndex]?.note ? 'Note · ' : ''}
                {rows?.[ingredientIndex]?.shoppingCategory || 'Other'}
              </small>
            </summary>
            <label>
              <span>Preparation note</span>
              <textarea
                rows={2}
                aria-label={`Ingredient ${groupIndex + 1}-${ingredientIndex + 1} note`}
                placeholder="Note"
                {...form.register(
                  `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.note` as const,
                )}
              />
            </label>
            <label>
              <span>Shopping category</span>
              <select
                aria-label={`Ingredient ${groupIndex + 1}-${ingredientIndex + 1} shopping category`}
                title="Shopping category"
                {...form.register(
                  `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.shoppingCategory` as const,
                )}
              >
                {SHOPPING_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </details>
          <input
            type="hidden"
            {...form.register(
              `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.pantryProductId` as const,
            )}
          />
          <FoodCatalogPicker
            context="recipe"
            launchLabel="Find food data"
            defaultQuery={rows?.[ingredientIndex]?.item ?? ''}
            onImported={(product) => {
              acknowledgeLink(product.id, product.displayName);
              setLinkedNames((names) => ({ ...names, [product.id]: product.displayName }));
              form.setValue(
                `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.item` as const,
                product.displayName,
                { shouldDirty: true },
              );
              form.setValue(
                `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.pantryProductId` as const,
                product.id,
                { shouldDirty: true },
              );
            }}
          />
          {rows?.[ingredientIndex]?.pantryProductId &&
            !acknowledgedLinks.some(
              (link) =>
                link.pantryProductId === rows[ingredientIndex].pantryProductId &&
                !ingredientIdentityChanged(link.item, rows[ingredientIndex].item),
            ) && (
              <aside className="ingredient-food-link" data-link-review role="alert">
                <strong>
                  Ingredient identity changed. Keep this food link or clear it and find another
                  food.
                </strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    acknowledgeLink(
                      rows[ingredientIndex].pantryProductId!,
                      rows[ingredientIndex].item,
                    )
                  }
                >
                  Keep food link
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    form.setValue(
                      `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.pantryProductId`,
                      '',
                      { shouldDirty: true },
                    );
                  }}
                >
                  Clear and relink
                </button>
              </aside>
            )}
          {ingredients.fields.length > 1 && (
            <div className="reorder-actions compact-actions">
              <button
                className="icon-button"
                type="button"
                disabled={ingredientIndex === 0}
                onClick={() => ingredients.move(ingredientIndex, ingredientIndex - 1)}
                aria-label={`Move ingredient ${ingredientIndex + 1} up`}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={ingredientIndex === ingredients.fields.length - 1}
                onClick={() => ingredients.move(ingredientIndex, ingredientIndex + 1)}
                aria-label={`Move ingredient ${ingredientIndex + 1} down`}
              >
                <ChevronDown size={14} />
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={ingredients.fields.length === 1}
                onClick={() => {
                  if (
                    !rows?.[ingredientIndex]?.item ||
                    window.confirm(
                      `Remove ingredient ${ingredientIndex + 1}: ${rows[ingredientIndex].item}?`,
                    )
                  )
                    ingredients.remove(ingredientIndex);
                }}
                aria-label={`Remove ingredient ${ingredientIndex + 1}`}
              >
                <Minus size={14} />
              </button>
            </div>
          )}
          <div className="ingredient-food-link">
            {rows?.[ingredientIndex]?.pantryProductId ? (
              <>
                <span>
                  Linked to{' '}
                  {linkedNames[rows[ingredientIndex].pantryProductId!] ??
                    linkedFoods[rows[ingredientIndex].pantryProductId!] ??
                    'saved food record'}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    form.setValue(
                      `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.pantryProductId`,
                      '',
                      { shouldDirty: true },
                    )
                  }
                >
                  Clear link
                </button>
                <small>
                  Food identity only; recipe amounts and pantry stock are separate. If you change
                  the ingredient, check this link or use Find food data to relink.
                </small>
              </>
            ) : (
              <span>{rows?.[ingredientIndex]?.item ? 'Not linked to food data' : ''}</span>
            )}
          </div>
        </div>
      ))}
      <button
        className="text-button"
        type="button"
        onClick={() =>
          ingredients.append({
            quantity: '',
            unit: '',
            item: '',
            note: '',
            shoppingCategory: 'Other',
            pantryProductId: '',
          })
        }
      >
        <Plus size={16} /> Add ingredient
      </button>
    </fieldset>
  );
}

function InstructionSectionEditor({
  form,
  sectionIndex,
  onMove,
  onRemove,
  isFirst,
  isLast,
}: {
  form: UseFormReturn<FormValues>;
  sectionIndex: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const steps = useWatch({
    control: form.control,
    name: `instructionSections.${sectionIndex}.steps` as const,
  });
  const [stepIds, setStepIds] = useState(() => steps.map(() => createClientUuid()));
  const updateSteps = (nextSteps: string[], ids?: string[]) => {
    if (ids) setStepIds(ids);
    form.setValue(`instructionSections.${sectionIndex}.steps` as const, nextSteps, {
      shouldDirty: true,
    });
  };
  return (
    <fieldset className="editor-group">
      <legend>Method section {sectionIndex + 1}</legend>
      <div className="editor-group-heading">
        <label>
          <span>
            Section title <em>(optional)</em>
          </span>
          <input
            {...form.register(`instructionSections.${sectionIndex}.title` as const)}
            placeholder="e.g. Make the soup"
          />
        </label>
        {!(isFirst && isLast) && (
          <div className="reorder-actions" aria-label={`Method section ${sectionIndex + 1} order`}>
            <button
              className="icon-button"
              type="button"
              disabled={isFirst}
              onClick={() => onMove(sectionIndex, sectionIndex - 1)}
              aria-label={`Move method section ${sectionIndex + 1} up`}
            >
              <ChevronUp size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={isLast}
              onClick={() => onMove(sectionIndex, sectionIndex + 1)}
              aria-label={`Move method section ${sectionIndex + 1} down`}
            >
              <ChevronDown size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={isFirst && isLast}
              onClick={() => {
                if (
                  !steps.some((step) => step.trim()) ||
                  window.confirm('Remove this method section and its contents?')
                )
                  onRemove();
              }}
              aria-label={`Remove method section ${sectionIndex + 1}`}
            >
              <Minus size={16} />
            </button>
          </div>
        )}
      </div>
      {steps.map((_step, stepIndex) => (
        <div className="step-editor" key={stepIds[stepIndex]}>
          <span aria-hidden="true">{stepIndex + 1}</span>
          <textarea
            aria-label={`Method section ${sectionIndex + 1}, step ${stepIndex + 1}`}
            rows={3}
            placeholder="Describe this step clearly."
            {...form.register(`instructionSections.${sectionIndex}.steps.${stepIndex}` as const)}
          />
          {steps.length > 1 && (
            <div className="reorder-actions compact-actions">
              <button
                className="icon-button"
                type="button"
                disabled={stepIndex === 0}
                onClick={() => {
                  const next = [...steps];
                  [next[stepIndex - 1], next[stepIndex]] = [next[stepIndex]!, next[stepIndex - 1]!];
                  const ids = [...stepIds];
                  [ids[stepIndex - 1], ids[stepIndex]] = [ids[stepIndex]!, ids[stepIndex - 1]!];
                  updateSteps(next, ids);
                  requestAnimationFrame(() =>
                    form.setFocus(`instructionSections.${sectionIndex}.steps.${stepIndex - 1}`),
                  );
                }}
                aria-label={`Move step ${stepIndex + 1} up`}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={stepIndex === steps.length - 1}
                onClick={() => {
                  const next = [...steps];
                  [next[stepIndex], next[stepIndex + 1]] = [next[stepIndex + 1]!, next[stepIndex]!];
                  const ids = [...stepIds];
                  [ids[stepIndex], ids[stepIndex + 1]] = [ids[stepIndex + 1]!, ids[stepIndex]!];
                  updateSteps(next, ids);
                  requestAnimationFrame(() =>
                    form.setFocus(`instructionSections.${sectionIndex}.steps.${stepIndex + 1}`),
                  );
                }}
                aria-label={`Move step ${stepIndex + 1} down`}
              >
                <ChevronDown size={14} />
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={steps.length === 1}
                onClick={() => {
                  if (!steps[stepIndex]?.trim() || window.confirm(`Remove step ${stepIndex + 1}?`))
                    updateSteps(
                      steps.filter((_, index) => index !== stepIndex),
                      stepIds.filter((_, index) => index !== stepIndex),
                    );
                }}
                aria-label={`Remove step ${stepIndex + 1}`}
              >
                <Minus size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        className="text-button"
        type="button"
        onClick={() => updateSteps([...steps, ''], [...stepIds, createClientUuid()])}
      >
        <Plus size={16} /> Add step
      </button>
    </fieldset>
  );
}

export function RecipeForm({
  initial = emptyRecipeInput,
  recipeId,
  currentRevision,
  confirmationLabel,
  intro,
  linkedFoods,
}: RecipeFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<FormValues | null>(null);
  const [aiImproving, setAiImproving] = useState(false);
  const [aiDraft, setAiDraft] = useState<FormValues | null>(null);
  const [aiBefore, setAiBefore] = useState<FormValues | null>(null);
  const [aiUndo, setAiUndo] = useState<FormValues | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const navigating = useRef(false);
  const defaults = useMemo<FormValues>(
    () =>
      ({
        ...emptyRecipeInput,
        ...initial,
        equipmentText: (initial?.equipment ?? emptyRecipeInput.equipment ?? []).join('\n'),
      }) as FormValues,
    [initial],
  );
  const [acknowledgedLinks, setAcknowledgedLinks] = useState(() =>
    defaults.ingredientGroups.flatMap((group) =>
      group.ingredients.flatMap((row) =>
        row.pantryProductId ? [{ pantryProductId: row.pantryProductId, item: row.item }] : [],
      ),
    ),
  );
  function acknowledgeLink(pantryProductId: string, item: string) {
    setAcknowledgedLinks((current) => [...current, { pantryProductId, item }]);
  }
  const form = useForm<FormValues>({
    resolver: zodResolver(recipeFormSchema) as never,
    defaultValues: defaults,
  });
  const watchedValues = useWatch({ control: form.control });
  const ingredientGroups = useFieldArray({ control: form.control, name: 'ingredientGroups' });
  const instructionSections = useFieldArray({ control: form.control, name: 'instructionSections' });
  const tags = useWatch({ control: form.control, name: 'tags' }) ?? [];
  const category = useWatch({ control: form.control, name: 'category' }) ?? '';
  const cuisine = useWatch({ control: form.control, name: 'cuisine' }) ?? '';
  const supportingCount = [
    watchedValues.sourceName,
    watchedValues.sourceUrl,
    watchedValues.originalAuthor,
    watchedValues.cookingMethod,
    watchedValues.equipmentText,
  ].filter(Boolean).length;
  const nutritionCount = Object.entries(watchedValues).filter(
    ([key, value]) => key.startsWith('nutrition') && value !== '' && value != null,
  ).length;
  const notesCount = [watchedValues.tips, watchedValues.sharedNotes].filter(Boolean).length;
  const draftKey = `bord:recipe-draft:${recipeId ?? 'new'}`;
  const legacyDraftKey = `our-recipes:recipe-draft:${recipeId ?? 'new'}`;

  useEffect(() => {
    let timer: number | undefined;
    try {
      const raw = localStorage.getItem(draftKey) ?? localStorage.getItem(legacyDraftKey);
      if (raw) {
        const candidate = restoreRecipeDraft(raw, defaults);
        timer = window.setTimeout(() => {
          if (candidate) setSavedDraft(candidate as unknown as FormValues);
          else
            setDraftMessage(
              'The stored draft could not be recovered. Your current editor is still available.',
            );
        }, 0);
      }
    } catch {
      timer = window.setTimeout(
        () =>
          setDraftMessage(
            'Local draft storage is unavailable. Keep this page open until you save.',
          ),
        0,
      );
    }
    return () => window.clearTimeout(timer);
  }, [draftKey, legacyDraftKey, defaults]);

  useEffect(() => {
    if (!form.formState.isDirty || savedDraft) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(watchedValues));
    } catch {
      window.setTimeout(
        () =>
          setDraftMessage(
            'Local draft recovery is unavailable. Keep this page open until you save.',
          ),
        0,
      );
    }
  }, [draftKey, form.formState.isDirty, watchedValues, savedDraft]);

  useEffect(() => {
    function checkNavigation(event: MouseEvent) {
      const link = (event.target as Element).closest?.('a[href]');
      if (
        !link ||
        navigating.current ||
        !form.formState.isDirty ||
        link.getAttribute('href')?.startsWith('#')
      )
        return;
      if (
        !window.confirm(
          'Leave this recipe with unsaved changes? A local draft may be available on this device.',
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    document.addEventListener('click', checkNavigation, true);
    return () => document.removeEventListener('click', checkNavigation, true);
  }, [form.formState.isDirty]);

  function revealField(name: string) {
    const field = formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`);
    let parent = field?.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    if (field?.getAttribute('type') === 'hidden')
      field.parentElement?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
    else field?.focus();
    field?.scrollIntoView({ block: 'center' });
  }
  function invalid(errors: typeof form.formState.errors) {
    const names: string[] = [];
    function collect(value: unknown, path = '') {
      if (!value || typeof value !== 'object') return;
      if ('message' in value) {
        names.push(path);
        return;
      }
      for (const [key, child] of Object.entries(value))
        if (key !== 'ref') collect(child, path ? `${path}.${key}` : key);
    }
    collect(errors);
    setInvalidFields(names);
    if (names[0]) revealField(names[0]);
  }

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [form.formState.isDirty]);

  async function submit(values: FormValues) {
    setServerError(null);
    const changedLinks = values.ingredientGroups.flatMap((group, groupIndex) =>
      group.ingredients.flatMap((row, ingredientIndex) =>
        row.pantryProductId &&
        !acknowledgedLinks.some(
          (link) =>
            link.pantryProductId === row.pantryProductId &&
            !ingredientIdentityChanged(link.item, row.item),
        )
          ? [`ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.item`]
          : [],
      ),
    );
    if (changedLinks.length) {
      setInvalidFields(changedLinks);
      setServerError(
        'Review the changed ingredient food links before saving. Keep each link deliberately or clear it.',
      );
      revealField(changedLinks[0]);
      return;
    }
    setInvalidFields([]);
    try {
      const basePayload = recipePayloadFromForm(values);
      const payload = recipeId
        ? recipeUpdateInputSchema.parse({ ...basePayload, expectedRevision: currentRevision })
        : recipeInputSchema.parse(basePayload);
      const response = await fetch(recipeId ? `/api/v1/recipes/${recipeId}` : '/api/v1/recipes', {
        method: recipeId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as {
        recipe?: { id: string };
        nutritionMappingRestore?: { missing?: number };
        nutritionRecalculation?: { status?: string; message?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.recipe) {
        const message = body?.error?.message ?? 'We could not save this recipe yet.';
        setServerError(message);
        showToast(message, 'error');
        return;
      }
      try {
        window.localStorage.removeItem(draftKey);
        window.localStorage.removeItem(legacyDraftKey);
      } catch {}
      navigating.current = true;
      form.reset(values);
      showToast(recipeId ? 'Recipe revision saved.' : 'Recipe added to your cookbook.', 'success');
      if (
        body.nutritionMappingRestore?.missing ||
        body.nutritionRecalculation?.status === 'unavailable'
      ) {
        showToast(
          body.nutritionRecalculation?.message ??
            'Recipe saved. Review Pantry mappings or normalized Nutrition for changed ingredients.',
          'info',
        );
      }
      router.push(`/recipes/${body.recipe.id}`);
      router.refresh();
    } catch {
      const message = 'The recipe could not be saved. Check the connection and try again.';
      setServerError(message);
      showToast(message, 'error');
    }
  }

  async function improveWithAi() {
    if (!recipeId || !currentRevision) return;
    setAiImproving(true);
    setServerError(null);
    try {
      const snapshot = structuredClone(form.getValues());
      setAiBefore(snapshot);
      const recipe = recipePayloadFromForm(snapshot);
      const response = await fetch(`/api/v1/recipes/${recipeId}/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, expectedRevision: currentRevision, recipe }),
      });
      const body = (await response.json().catch(() => null)) as {
        candidate?: AiRecipeCandidate;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.candidate) {
        throw new Error(body?.error?.message ?? 'OpenAI could not improve this recipe.');
      }
      const improvedValues = {
        ...body.candidate.recipe,
        equipmentText: body.candidate.recipe.equipment.join('\n'),
      } as FormValues;
      setAiDraft(improvedValues);
      showToast(
        'AI improvement draft ready. Review the changes, then save a new revision.',
        'success',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'OpenAI could not improve this recipe.';
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setAiImproving(false);
    }
  }

  return (
    <form
      className={`recipe-form${intro ? ' editor-form-layout' : ''}`}
      ref={formRef}
      onSubmit={(event) => void form.handleSubmit(submit, invalid)(event)}
      noValidate
    >
      {intro ? <div className="editor-intro">{intro}</div> : null}
      <div className="editor-save-bar">
        <span role="status">
          {form.formState.isSubmitting
            ? 'Saving…'
            : form.formState.isDirty
              ? 'Unsaved recipe draft'
              : 'Ready to edit'}
        </span>
        <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
          {recipeId ? 'Save changes' : (confirmationLabel ?? 'Add recipe')}
        </button>
      </div>
      {aiUndo && (
        <aside className="draft-recovery">
          <span>AI changes are an unsaved draft.</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (window.confirm('Restore the editor from before applying AI changes?')) {
                form.reset(aiUndo, { keepDefaultValues: true });
                setAiUndo(null);
              }
            }}
          >
            Undo AI draft
          </button>
        </aside>
      )}
      {draftMessage && <p role="status">{draftMessage}</p>}
      {invalidFields.length > 0 && (
        <aside className="form-error" role="alert">
          <strong>Check these fields before saving</strong>
          <ul>
            {invalidFields.map((name) => (
              <li key={name}>
                <button type="button" className="text-button" onClick={() => revealField(name)}>
                  {fieldLabel(name)}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="editor-card-column">
        {savedDraft && (
          <aside className="draft-recovery" aria-live="polite">
            <div>
              <strong>A local draft is ready</strong>
              <span>Restore it if this is the edit you meant to continue.</span>
            </div>
            <div>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  form.reset(savedDraft, { keepDefaultValues: true });
                  setSavedDraft(null);
                }}
              >
                Restore draft
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(draftKey);
                    window.localStorage.removeItem(legacyDraftKey);
                  } catch {}
                  setSavedDraft(null);
                }}
              >
                Dismiss
              </button>
            </div>
          </aside>
        )}
        <section className="recipe-form-section">
          <p className="eyebrow">THE RECIPE CARD</p>
          <label>
            <span>Recipe name</span>
            <input
              {...form.register('title')}
              placeholder="e.g. Sunday tomato soup"
              aria-invalid={Boolean(form.formState.errors.title)}
            />
            {form.formState.errors.title && (
              <small role="alert">{form.formState.errors.title.message}</small>
            )}
          </label>
          <label>
            <span>
              Short note <em>(optional)</em>
            </span>
            <textarea
              {...form.register('summary')}
              rows={3}
              placeholder="Why it belongs in your cookbook."
            />
          </label>
          <div className="field-grid editor-timings">
            <label>
              <span>Serves</span>
              <input {...form.register('servings')} />
            </label>
            <label>
              <span>Prep minutes</span>
              <input type="number" min="0" {...form.register('prepMinutes')} />
            </label>
            <label>
              <span>Cook minutes</span>
              <input type="number" min="0" {...form.register('cookMinutes')} />
            </label>
          </div>
          <div className="field-grid two-columns">
            <label>
              <span>Rest minutes</span>
              <input type="number" min="0" {...form.register('restMinutes')} />
            </label>
            <label>
              <span>
                Difficulty <em>(optional)</em>
              </span>
              <select {...form.register('difficulty')}>
                <option value="">Not set</option>
                {initial.difficulty &&
                  !['easy', 'standard', 'involved'].includes(initial.difficulty) && (
                    <option value={initial.difficulty}>{initial.difficulty} (saved value)</option>
                  )}
                <option value="easy">Easy</option>
                <option value="standard">Standard</option>
                <option value="involved">Involved</option>
              </select>
            </label>
          </div>
          <details className="editor-optional" open={Boolean(initial.category || initial.cuisine)}>
            <summary>
              Classification{' '}
              <small>
                {parseRecipeTaxonomyValues(category).length +
                  parseRecipeTaxonomyValues(cuisine).length}{' '}
                selected
              </small>
            </summary>
            <div className="field-grid two-columns recipe-taxonomy-grid">
              <input type="hidden" {...form.register('category')} />
              <RecipeTaxonomySelector
                label="Categories"
                value={parseRecipeTaxonomyValues(category)}
                options={RECIPE_CATEGORY_OPTIONS}
                onChange={(values) =>
                  form.setValue('category', joinRecipeTaxonomyValues(values), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                error={form.formState.errors.category?.message}
              />
              <input type="hidden" {...form.register('cuisine')} />
              <RecipeTaxonomySelector
                label="Cuisines"
                value={parseRecipeTaxonomyValues(cuisine)}
                options={RECIPE_CUISINE_OPTIONS}
                onChange={(values) =>
                  form.setValue('cuisine', joinRecipeTaxonomyValues(values), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                error={form.formState.errors.cuisine?.message}
              />
            </div>
          </details>
        </section>
      </div>

      <section className="recipe-form-section">
        <div className="section-heading-row">
          <h2>Ingredients</h2>
          <span>Use sections for components, sauces, or toppings.</span>
        </div>
        {ingredientGroups.fields.map((field, index) => (
          <IngredientGroupEditor
            key={field.id}
            form={form}
            linkedFoods={linkedFoods}
            acknowledgedLinks={acknowledgedLinks}
            acknowledgeLink={acknowledgeLink}
            groupIndex={index}
            onMove={ingredientGroups.move}
            onRemove={() => ingredientGroups.remove(index)}
            isFirst={index === 0}
            isLast={index === ingredientGroups.fields.length - 1}
          />
        ))}
        <button
          className="text-button"
          type="button"
          onClick={() =>
            ingredientGroups.append({
              name: '',
              ingredients: [
                {
                  quantity: '',
                  unit: '',
                  item: '',
                  note: '',
                  shoppingCategory: 'Other',
                  pantryProductId: '',
                },
              ],
            })
          }
        >
          <Plus size={16} /> Add ingredient section
        </button>
      </section>

      <section className="recipe-form-section">
        <div className="section-heading-row">
          <h2>Method</h2>
          <div className="section-heading-actions">
            <span>Keep sections short and kitchen-readable.</span>
            {recipeId ? (
              <button
                className="text-button ai-improve-button"
                type="button"
                onClick={() => void improveWithAi()}
                disabled={aiImproving || form.formState.isSubmitting}
                aria-describedby="editor-ai-permission"
              >
                {aiImproving ? (
                  <LoadingIndicator label="Improving recipe" />
                ) : (
                  <Sparkles size={16} aria-hidden="true" />
                )}
                {aiImproving ? 'Improving with OpenAI…' : 'AI Improve'}
              </button>
            ) : null}
          </div>
        </div>
        {recipeId && (
          <p id="editor-ai-permission" className="editor-help">
            AI Improve starts one paid AI request. Review and apply the suggested draft; your
            current edits stay intact until you choose.
          </p>
        )}
        {instructionSections.fields.map((field, index) => (
          <InstructionSectionEditor
            key={field.id}
            form={form}
            sectionIndex={index}
            onMove={instructionSections.move}
            onRemove={() => instructionSections.remove(index)}
            isFirst={index === 0}
            isLast={index === instructionSections.fields.length - 1}
          />
        ))}
        <button
          className="text-button"
          type="button"
          onClick={() => instructionSections.append({ title: '', steps: [''] })}
        >
          <Plus size={16} /> Add method section
        </button>
      </section>

      <details
        className="recipe-form-section editor-optional"
        open={Boolean(
          initial.tags?.length ||
          initial.sourceName ||
          initial.sourceUrl ||
          initial.originalAuthor ||
          initial.cookingMethod ||
          initial.equipment?.length,
        )}
      >
        <summary>
          Source, equipment and tags{' '}
          <small>
            {tags.length ? `${tags.length} tags · ` : ''}
            {supportingCount ? `${supportingCount} fields filled` : 'Optional recipe details'}
          </small>
        </summary>
        <div className="field-grid two-columns">
          <RecipeTagSelector
            value={tags}
            onChange={(nextTags) =>
              form.setValue('tags', nextTags, { shouldDirty: true, shouldValidate: true })
            }
          />
          <label>
            <span>
              Source name <em>(optional)</em>
            </span>
            <input {...form.register('sourceName')} />
          </label>
          <label>
            <span>
              Source URL <em>(optional)</em>
            </span>
            <input type="url" {...form.register('sourceUrl')} />
          </label>
          <label>
            <span>
              Original author <em>(optional)</em>
            </span>
            <input {...form.register('originalAuthor')} placeholder="e.g. Rowan Lee" />
          </label>
          <label>
            <span>
              Cooking method <em>(optional)</em>
            </span>
            <input {...form.register('cookingMethod')} placeholder="e.g. oven-baked" />
          </label>
          <label>
            <span>
              Equipment <em>(one item per line, optional)</em>
            </span>
            <textarea
              rows={4}
              {...form.register('equipmentText')}
              placeholder={'Large pot\nImmersion blender'}
            />
          </label>
        </div>
      </details>
      <details
        className="recipe-form-section editor-optional"
        open={Object.entries(initial).some(
          ([key, value]) => key.startsWith('nutrition') && value !== '' && value != null,
        )}
      >
        <summary>
          Recipe-source nutrition{' '}
          <small>
            {nutritionCount
              ? `${nutritionCount} values filled · per serving`
              : 'Optional · per serving; leave unknown values blank'}
          </small>
        </summary>
        <fieldset className="nutrition-fields">
          <legend>
            Nutrition per serving <em>(optional; review AI estimates)</em>
          </legend>
          <div className="field-grid three-columns">
            <label>
              <span>Calories (kcal)</span>
              <input type="number" min="0" step="any" {...form.register('nutritionCalories')} />
            </label>
            <label>
              <span>Protein (g)</span>
              <input type="number" min="0" step="any" {...form.register('nutritionProteinGrams')} />
            </label>
            <label>
              <span>Carbohydrates (g)</span>
              <input
                type="number"
                min="0"
                step="any"
                {...form.register('nutritionCarbohydrateGrams')}
              />
            </label>
            <label>
              <span>Fat (g)</span>
              <input type="number" min="0" step="any" {...form.register('nutritionFatGrams')} />
            </label>
            <label>
              <span>Saturated fat (g)</span>
              <input
                type="number"
                min="0"
                step="any"
                {...form.register('nutritionSaturatedFatGrams')}
              />
            </label>
            <label>
              <span>Fiber (g)</span>
              <input type="number" min="0" step="any" {...form.register('nutritionFiberGrams')} />
            </label>
            <label>
              <span>Sugar (g)</span>
              <input type="number" min="0" step="any" {...form.register('nutritionSugarGrams')} />
            </label>
            <label>
              <span>Sodium (mg)</span>
              <input
                type="number"
                min="0"
                step="any"
                {...form.register('nutritionSodiumMilligrams')}
              />
            </label>
          </div>
        </fieldset>
      </details>
      <details
        className="recipe-form-section editor-optional"
        open={Boolean(initial.tips || initial.sharedNotes)}
      >
        <summary>
          Tips and shared notes{' '}
          <small>
            {notesCount
              ? `${notesCount} notes filled · shared with the household`
              : 'Optional · visible to the household'}
          </small>
        </summary>
        <label>
          <span>
            Tips <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            {...form.register('tips')}
            placeholder="What makes this recipe work."
          />
        </label>
        <label>
          <span>
            Shared notes <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            {...form.register('sharedNotes')}
            placeholder="A household note for every cook."
          />
        </label>
      </details>
      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? (
          <LoadingIndicator label="Saving recipe" />
        ) : (
          <Save size={17} aria-hidden="true" />
        )}{' '}
        {form.formState.isSubmitting
          ? 'Saving recipe…'
          : recipeId
            ? 'Save changes'
            : (confirmationLabel ?? 'Add recipe')}
      </button>
      {aiDraft && (
        <AppDialog
          open
          onClose={() => setAiDraft(null)}
          aria-label="Review AI improvement"
          className="editor-ai-review"
        >
          <h2>Review AI improvement</h2>
          <p>
            Your current editor has been kept, including changes made while waiting. Applying this
            draft replaces it; cancel keeps your edits.
          </p>
          {aiBefore && (
            <details>
              <summary>Recipe before the request</summary>
              <h3>{aiBefore.title}</h3>
              <p>{aiBefore.summary}</p>
              {aiBefore.instructionSections.map((section, index) => (
                <ol key={index}>
                  {section.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              ))}
            </details>
          )}
          <details open>
            <summary>Suggested recipe draft</summary>
            <h3>{aiDraft.title}</h3>
            {aiDraft.instructionSections.map((section, index) => (
              <div key={index}>
                <strong>{section.title}</strong>
                <ol>
                  {section.steps.map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ol>
              </div>
            ))}
          </details>
          <button type="button" className="secondary-button" onClick={() => setAiDraft(null)}>
            Keep current edits
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (window.confirm('Replace the current unsaved editor with this AI draft?')) {
                setAiUndo(structuredClone(form.getValues()));
                form.reset(aiDraft, { keepDefaultValues: true });
                setAiDraft(null);
              }
            }}
          >
            Apply draft
          </button>
        </AppDialog>
      )}
    </form>
  );
}
