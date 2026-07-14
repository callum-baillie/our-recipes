'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, Minus, Plus, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import {
  emptyRecipeInput,
  recipeInputSchema,
  recipeUpdateInputSchema,
  type RecipeInput,
  type RecipePayload,
} from '@/lib/domain/recipe';

type FormValues = RecipePayload & { tagsText: string; equipmentText: string };
const recipeFormSchema = recipeInputSchema.extend({
  tagsText: z.string(),
  equipmentText: z.string(),
});

type RecipeFormProps = {
  initial?: RecipeInput;
  recipeId?: string;
  currentRevision?: number;
  confirmationLabel?: string;
};

function IngredientGroupEditor({
  form,
  groupIndex,
  onMove,
  onRemove,
  isFirst,
  isLast,
}: {
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
        <div className="reorder-actions" aria-label={`Ingredient section ${groupIndex + 1} order`}>
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
            onClick={onRemove}
            aria-label={`Remove ingredient section ${groupIndex + 1}`}
          >
            <Minus size={16} />
          </button>
        </div>
      </div>
      {ingredients.fields.map((field, ingredientIndex) => (
        <div className="ingredient-row" key={field.id}>
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
          <input
            aria-label={`Ingredient ${groupIndex + 1}-${ingredientIndex + 1} note`}
            placeholder="Note"
            {...form.register(
              `ingredientGroups.${groupIndex}.ingredients.${ingredientIndex}.note` as const,
            )}
          />
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
              onClick={() => ingredients.remove(ingredientIndex)}
              aria-label={`Remove ingredient ${ingredientIndex + 1}`}
            >
              <Minus size={14} />
            </button>
          </div>
        </div>
      ))}
      <button
        className="text-button"
        type="button"
        onClick={() => ingredients.append({ quantity: '', unit: '', item: '', note: '' })}
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
  const updateSteps = (nextSteps: string[]) => {
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
            onClick={onRemove}
            aria-label={`Remove method section ${sectionIndex + 1}`}
          >
            <Minus size={16} />
          </button>
        </div>
      </div>
      {steps.map((_step, stepIndex) => (
        <div className="step-editor" key={`${sectionIndex}-${stepIndex}`}>
          <span aria-hidden="true">{stepIndex + 1}</span>
          <textarea
            aria-label={`Method section ${sectionIndex + 1}, step ${stepIndex + 1}`}
            rows={3}
            placeholder="Describe this step clearly."
            {...form.register(`instructionSections.${sectionIndex}.steps.${stepIndex}` as const)}
          />
          <div className="reorder-actions compact-actions">
            <button
              className="icon-button"
              type="button"
              disabled={stepIndex === 0}
              onClick={() => {
                const next = [...steps];
                [next[stepIndex - 1], next[stepIndex]] = [next[stepIndex]!, next[stepIndex - 1]!];
                updateSteps(next);
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
                updateSteps(next);
              }}
              aria-label={`Move step ${stepIndex + 1} down`}
            >
              <ChevronDown size={14} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={steps.length === 1}
              onClick={() => updateSteps(steps.filter((_, index) => index !== stepIndex))}
              aria-label={`Remove step ${stepIndex + 1}`}
            >
              <Minus size={14} />
            </button>
          </div>
        </div>
      ))}
      <button className="text-button" type="button" onClick={() => updateSteps([...steps, ''])}>
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
}: RecipeFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<FormValues | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const defaults = useMemo<FormValues>(
    () =>
      ({
        ...emptyRecipeInput,
        ...initial,
        tagsText: (initial.tags ?? emptyRecipeInput.tags).join(', '),
        equipmentText: (initial?.equipment ?? emptyRecipeInput.equipment ?? []).join('\n'),
      }) as FormValues,
    [initial],
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(recipeFormSchema) as never,
    defaultValues: defaults,
  });
  const watchedValues = useWatch({ control: form.control });
  const ingredientGroups = useFieldArray({ control: form.control, name: 'ingredientGroups' });
  const instructionSections = useFieldArray({ control: form.control, name: 'instructionSections' });
  const draftKey = `our-recipes:recipe-draft:${recipeId ?? 'new'}`;

  useEffect(() => {
    fetch('/api/v1/tags')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { tags?: Array<{ name?: string }> } | null) => {
        setAvailableTags(body?.tags?.flatMap((tag) => (tag.name ? [tag.name] : [])) ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let restoreTimer: number | undefined;
    const rawDraft = window.localStorage.getItem(draftKey);
    if (!rawDraft) return undefined;
    try {
      const parsed = JSON.parse(rawDraft) as FormValues;
      const candidate = recipeFormSchema.safeParse({
        ...parsed,
        tagsText: typeof parsed.tagsText === 'string' ? parsed.tagsText : '',
        tags: typeof parsed.tagsText === 'string' ? parsed.tagsText.split(',') : parsed.tags,
        equipmentText: typeof parsed.equipmentText === 'string' ? parsed.equipmentText : '',
        equipment:
          typeof parsed.equipmentText === 'string'
            ? parsed.equipmentText.split('\n').filter(Boolean)
            : parsed.equipment,
      });
      if (candidate.success) restoreTimer = window.setTimeout(() => setSavedDraft(parsed), 0);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
    return () => {
      if (restoreTimer) window.clearTimeout(restoreTimer);
    };
  }, [draftKey]);

  useEffect(() => {
    if (form.formState.isDirty)
      window.localStorage.setItem(draftKey, JSON.stringify(watchedValues));
  }, [draftKey, form.formState.isDirty, watchedValues]);

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
    const basePayload = {
      ...values,
      tags: values.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      equipment: values.equipmentText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    };
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
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.recipe) {
      setServerError(body?.error?.message ?? 'We could not save this recipe yet.');
      return;
    }
    window.localStorage.removeItem(draftKey);
    form.reset(values);
    router.push(`/recipes/${body.recipe.id}`);
    router.refresh();
  }

  return (
    <form className="recipe-form" onSubmit={form.handleSubmit(submit)} noValidate>
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
                form.reset(savedDraft);
                setSavedDraft(null);
              }}
            >
              Restore draft
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                window.localStorage.removeItem(draftKey);
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
        <div className="field-grid three-columns">
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
        <div className="field-grid three-columns">
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
              <option value="easy">Easy</option>
              <option value="standard">Standard</option>
              <option value="involved">Involved</option>
            </select>
          </label>
          <label>
            <span>
              Category <em>(optional)</em>
            </span>
            <input {...form.register('category')} placeholder="e.g. Dinner" />
          </label>
        </div>
        <label>
          <span>
            Cuisine <em>(optional)</em>
          </span>
          <input {...form.register('cuisine')} placeholder="e.g. Italian" />
        </label>
      </section>

      <section className="recipe-form-section">
        <div className="section-heading-row">
          <h2>Ingredients</h2>
          <span>Use sections for components, sauces, or toppings.</span>
        </div>
        {ingredientGroups.fields.map((field, index) => (
          <IngredientGroupEditor
            key={field.id}
            form={form}
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
              ingredients: [{ quantity: '', unit: '', item: '', note: '' }],
            })
          }
        >
          <Plus size={16} /> Add ingredient section
        </button>
      </section>

      <section className="recipe-form-section">
        <div className="section-heading-row">
          <h2>Method</h2>
          <span>Keep sections short and kitchen-readable.</span>
        </div>
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

      <section className="recipe-form-section two-columns">
        <label>
          <span>
            Tags <em>(comma-separated)</em>
          </span>
          <input
            {...form.register('tagsText')}
            list="household-tags"
            placeholder="weeknight, vegetarian"
          />
        </label>
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
        <fieldset className="nutrition-fields">
          <legend>
            Nutrition as entered <em>(optional; no lookup)</em>
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
              <span>Fiber (g)</span>
              <input type="number" min="0" step="any" {...form.register('nutritionFiberGrams')} />
            </label>
          </div>
        </fieldset>
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
      </section>
      <datalist id="household-tags">
        {availableTags.map((tag) => (
          <option value={tag} key={tag} />
        ))}
      </datalist>
      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        <Save size={17} aria-hidden="true" />{' '}
        {recipeId ? 'Save a new revision' : (confirmationLabel ?? 'Add to the cookbook')}
      </button>
    </form>
  );
}
