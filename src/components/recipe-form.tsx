'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, LoaderCircle, Minus, Plus, Save, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

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

type FormValues = RecipePayload & { equipmentText: string };
const recipeFormSchema = recipeInputSchema.extend({
  equipmentText: z.string(),
});

type StoredDraft = Partial<FormValues> & { tagsText?: unknown; equipmentText?: unknown };

function recipePayloadFromForm(values: FormValues): RecipePayload {
  return recipeInputSchema.parse({
    ...values,
    equipment: values.equipmentText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

type RecipeFormProps = {
  initial?: RecipeInput;
  recipeId?: string;
  currentRevision?: number;
  confirmationLabel?: string;
  intro?: ReactNode;
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
  intro,
}: RecipeFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<FormValues | null>(null);
  const [aiImproving, setAiImproving] = useState(false);
  const defaults = useMemo<FormValues>(
    () =>
      ({
        ...emptyRecipeInput,
        ...initial,
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
  const tags = useWatch({ control: form.control, name: 'tags' }) ?? [];
  const category = useWatch({ control: form.control, name: 'category' }) ?? '';
  const cuisine = useWatch({ control: form.control, name: 'cuisine' }) ?? '';
  const draftKey = `our-recipes:recipe-draft:${recipeId ?? 'new'}`;

  useEffect(() => {
    let restoreTimer: number | undefined;
    const rawDraft = window.localStorage.getItem(draftKey);
    if (!rawDraft) return undefined;
    try {
      const parsed = JSON.parse(rawDraft) as StoredDraft;
      const candidate = recipeFormSchema.safeParse({
        ...parsed,
        tags:
          typeof parsed.tagsText === 'string'
            ? parsed.tagsText
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : parsed.tags,
        equipmentText: typeof parsed.equipmentText === 'string' ? parsed.equipmentText : '',
        equipment:
          typeof parsed.equipmentText === 'string'
            ? parsed.equipmentText.split('\n').filter(Boolean)
            : parsed.equipment,
      });
      if (candidate.success)
        restoreTimer = window.setTimeout(() => setSavedDraft(candidate.data), 0);
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
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.recipe) {
        const message = body?.error?.message ?? 'We could not save this recipe yet.';
        setServerError(message);
        showToast(message, 'error');
        return;
      }
      window.localStorage.removeItem(draftKey);
      form.reset(values);
      showToast(recipeId ? 'Recipe revision saved.' : 'Recipe added to your cookbook.', 'success');
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
      const recipe = recipePayloadFromForm(form.getValues());
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
      form.reset(improvedValues, { keepDefaultValues: true });
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
      onSubmit={form.handleSubmit(submit)}
      noValidate
    >
      {intro ? <header className="editor-intro">{intro}</header> : null}
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
                <option value="easy">Easy</option>
                <option value="standard">Standard</option>
                <option value="involved">Involved</option>
              </select>
            </label>
          </div>
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
          <div className="section-heading-actions">
            <span>Keep sections short and kitchen-readable.</span>
            {recipeId ? (
              <button
                className="text-button ai-improve-button"
                type="button"
                onClick={() => void improveWithAi()}
                disabled={aiImproving || form.formState.isSubmitting}
                title="Uses one paid OpenAI request and keeps ingredients unchanged"
              >
                {aiImproving ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Sparkles size={16} aria-hidden="true" />
                )}
                {aiImproving ? 'Improving with OpenAI…' : 'AI Improve'}
              </button>
            ) : null}
          </div>
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
      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? (
          <LoaderCircle className="spin" size={17} aria-hidden="true" />
        ) : (
          <Save size={17} aria-hidden="true" />
        )}{' '}
        {form.formState.isSubmitting
          ? 'Saving recipe…'
          : recipeId
            ? 'Save a new revision'
            : (confirmationLabel ?? 'Add to the cookbook')}
      </button>
    </form>
  );
}
