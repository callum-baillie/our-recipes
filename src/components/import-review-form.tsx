'use client';

import { LoaderCircle, Minus, Plus, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { recipeInputSchema, type RecipePayload } from '@/lib/domain/recipe';

type ImportReviewFormProps = {
  initial: RecipePayload;
  importId?: string;
  confirmationEndpoint?: '/api/v1/jsonld-drafts/confirm';
};

export function ImportReviewForm({
  importId,
  confirmationEndpoint,
  initial,
}: ImportReviewFormProps) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipePayload>(initial);
  const [tagsText, setTagsText] = useState((initial.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateGroup(groupIndex: number, next: RecipePayload['ingredientGroups'][number]) {
    setRecipe((current) => ({
      ...current,
      ingredientGroups: current.ingredientGroups.map((group, index) =>
        index === groupIndex ? next : group,
      ),
    }));
  }

  function updateSection(sectionIndex: number, next: RecipePayload['instructionSections'][number]) {
    setRecipe((current) => ({
      ...current,
      instructionSections: current.instructionSections.map((section, index) =>
        index === sectionIndex ? next : section,
      ),
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = recipeInputSchema.safeParse({
      ...recipe,
      tags: tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the reviewed recipe details.');
      return;
    }
    setPending(true);
    const endpoint = importId ? `/api/v1/imports/${importId}/confirm` : confirmationEndpoint;
    if (!endpoint) {
      setError('This review draft has no confirmation endpoint.');
      return;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: parsed.data }),
    });
    const body = (await response.json().catch(() => null)) as {
      recipe?: { id?: string };
      error?: { message?: string };
    } | null;
    setPending(false);
    if (!response.ok || !body?.recipe?.id) {
      setError(body?.error?.message ?? 'We could not add this reviewed recipe yet.');
      return;
    }
    router.push(`/recipes/${body.recipe.id}`);
    router.refresh();
  }

  return (
    <form className="import-review-form" onSubmit={(event) => void submit(event)} noValidate>
      <section className="import-review-section">
        <p className="eyebrow">REVIEW THE RECIPE</p>
        <label>
          <span>Recipe name</span>
          <input
            aria-label="Recipe name"
            value={recipe.title}
            onChange={(event) =>
              setRecipe((current) => ({ ...current, title: event.target.value }))
            }
            required
          />
        </label>
        <label>
          <span>
            Summary <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            value={recipe.summary}
            onChange={(event) =>
              setRecipe((current) => ({ ...current, summary: event.target.value }))
            }
          />
        </label>
        <div className="import-field-grid">
          <label>
            <span>Servings</span>
            <input
              value={recipe.servings}
              onChange={(event) =>
                setRecipe((current) => ({ ...current, servings: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>Prep minutes</span>
            <input
              type="number"
              min="0"
              max="10080"
              value={recipe.prepMinutes}
              onChange={(event) =>
                setRecipe((current) => ({
                  ...current,
                  prepMinutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            <span>Cook minutes</span>
            <input
              type="number"
              min="0"
              max="10080"
              value={recipe.cookMinutes}
              onChange={(event) =>
                setRecipe((current) => ({
                  ...current,
                  cookMinutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            <span>Rest minutes</span>
            <input
              type="number"
              min="0"
              max="10080"
              value={recipe.restMinutes ?? 0}
              onChange={(event) =>
                setRecipe((current) => ({
                  ...current,
                  restMinutes: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="import-review-section">
        <div className="editor-group-heading">
          <h2>Ingredients</h2>
        </div>
        {recipe.ingredientGroups.map((group, groupIndex) => (
          <div className="import-nested-group" key={`ingredient-group-${groupIndex}`}>
            {recipe.ingredientGroups.length > 1 && <h3>Ingredient group {groupIndex + 1}</h3>}
            <div className="editor-group-heading">
              <label>
                <span>
                  Ingredient section title <em>(optional)</em>
                </span>
                <input
                  value={group.name}
                  onChange={(event) =>
                    updateGroup(groupIndex, { ...group, name: event.target.value })
                  }
                />
              </label>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  updateGroup(groupIndex, {
                    ...group,
                    ingredients: [
                      ...group.ingredients,
                      { quantity: '', unit: '', item: '', note: '' },
                    ],
                  })
                }
              >
                <Plus size={16} aria-hidden="true" /> Add ingredient
              </button>
            </div>
            <div
              className="import-ingredients"
              role="group"
              aria-label={`Imported ingredients group ${groupIndex + 1}`}
            >
              {group.ingredients.map((ingredient, index) => {
                const ingredientLabel =
                  recipe.ingredientGroups.length === 1
                    ? `Ingredient ${index + 1}`
                    : `Ingredient ${groupIndex + 1}-${index + 1}`;
                return (
                  <div className="ingredient-row" key={`ingredient-${groupIndex}-${index}`}>
                    <input
                      aria-label={`${ingredientLabel} quantity`}
                      inputMode="decimal"
                      placeholder="Qty"
                      value={ingredient.quantity}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateGroup(groupIndex, {
                          ...group,
                          ingredients: group.ingredients.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, quantity: value === '' ? '' : Number(value) }
                              : current,
                          ),
                        });
                      }}
                    />
                    <input
                      aria-label={`${ingredientLabel} unit`}
                      placeholder="Unit"
                      value={ingredient.unit}
                      onChange={(event) =>
                        updateGroup(groupIndex, {
                          ...group,
                          ingredients: group.ingredients.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, unit: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`${ingredientLabel} item`}
                      placeholder="Ingredient"
                      value={ingredient.item}
                      onChange={(event) =>
                        updateGroup(groupIndex, {
                          ...group,
                          ingredients: group.ingredients.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, item: event.target.value }
                              : current,
                          ),
                        })
                      }
                      required
                    />
                    <input
                      aria-label={`${ingredientLabel} note`}
                      placeholder="Note"
                      value={ingredient.note}
                      onChange={(event) =>
                        updateGroup(groupIndex, {
                          ...group,
                          ingredients: group.ingredients.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, note: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-button"
                      type="button"
                      disabled={group.ingredients.length === 1}
                      onClick={() =>
                        updateGroup(groupIndex, {
                          ...group,
                          ingredients: group.ingredients.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        })
                      }
                      aria-label={`Remove ${ingredientLabel.toLocaleLowerCase()}`}
                    >
                      <Minus size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="import-review-section">
        <div className="editor-group-heading">
          <h2>Method</h2>
        </div>
        {recipe.instructionSections.map((section, sectionIndex) => (
          <div className="import-nested-group" key={`instruction-section-${sectionIndex}`}>
            {recipe.instructionSections.length > 1 && <h3>Method section {sectionIndex + 1}</h3>}
            <div className="editor-group-heading">
              <label>
                <span>
                  Method section title <em>(optional)</em>
                </span>
                <input
                  value={section.title}
                  onChange={(event) =>
                    updateSection(sectionIndex, { ...section, title: event.target.value })
                  }
                />
              </label>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  updateSection(sectionIndex, { ...section, steps: [...section.steps, ''] })
                }
              >
                <Plus size={16} aria-hidden="true" /> Add step
              </button>
            </div>
            <div
              className="import-steps"
              role="group"
              aria-label={`Imported method section ${sectionIndex + 1}`}
            >
              {section.steps.map((step, index) => {
                const stepLabel =
                  recipe.instructionSections.length === 1
                    ? `Method step ${index + 1}`
                    : `Method section ${sectionIndex + 1}, step ${index + 1}`;
                return (
                  <div className="step-editor" key={`step-${sectionIndex}-${index}`}>
                    <span aria-hidden="true">{index + 1}</span>
                    <textarea
                      aria-label={stepLabel}
                      rows={3}
                      value={step}
                      onChange={(event) =>
                        updateSection(sectionIndex, {
                          ...section,
                          steps: section.steps.map((current, currentIndex) =>
                            currentIndex === index ? event.target.value : current,
                          ),
                        })
                      }
                      required
                    />
                    <button
                      className="icon-button"
                      type="button"
                      disabled={section.steps.length === 1}
                      onClick={() =>
                        updateSection(sectionIndex, {
                          ...section,
                          steps: section.steps.filter((_, currentIndex) => currentIndex !== index),
                        })
                      }
                      aria-label={`Remove ${stepLabel.toLocaleLowerCase()}`}
                    >
                      <Minus size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="import-review-section">
        <h2>Source and notes</h2>
        <div className="import-field-grid">
          <label>
            <span>Source name</span>
            <input
              value={recipe.sourceName}
              onChange={(event) =>
                setRecipe((current) => ({ ...current, sourceName: event.target.value }))
              }
            />
          </label>
          <label>
            <span>
              Source URL <em>(optional)</em>
            </span>
            <input
              type="url"
              value={recipe.sourceUrl}
              onChange={(event) =>
                setRecipe((current) => ({ ...current, sourceUrl: event.target.value }))
              }
            />
          </label>
          <label>
            <span>
              Tags <em>(comma-separated)</em>
            </span>
            <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
          </label>
          <label>
            <span>
              Cuisine <em>(optional)</em>
            </span>
            <input
              value={recipe.cuisine ?? ''}
              onChange={(event) =>
                setRecipe((current) => ({ ...current, cuisine: event.target.value }))
              }
            />
          </label>
          <label>
            <span>
              Category <em>(optional)</em>
            </span>
            <input
              value={recipe.category}
              onChange={(event) =>
                setRecipe((current) => ({ ...current, category: event.target.value }))
              }
            />
          </label>
          <label>
            <span>
              Difficulty <em>(optional)</em>
            </span>
            <input
              value={recipe.difficulty}
              onChange={(event) =>
                setRecipe((current) => ({ ...current, difficulty: event.target.value }))
              }
            />
          </label>
        </div>
        <label>
          <span>
            Tips <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            value={recipe.tips}
            onChange={(event) => setRecipe((current) => ({ ...current, tips: event.target.value }))}
          />
        </label>
        <label>
          <span>
            Household notes <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            value={recipe.sharedNotes ?? ''}
            onChange={(event) =>
              setRecipe((current) => ({ ...current, sharedNotes: event.target.value }))
            }
          />
        </label>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Save size={17} aria-hidden="true" />
        )}
        Confirm and add to cookbook
      </button>
    </form>
  );
}
