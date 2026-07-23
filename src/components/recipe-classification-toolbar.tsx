'use client';

import { Plus, Tag, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CSSProperties, FormEvent, useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';

import { useToast } from '@/components/toast-provider';
import { parseRecipeTaxonomyValues } from '@/lib/domain/recipe';

type RecipeClassificationToolbarProps = {
  recipeId: string;
  currentRevision: number;
  category: string;
  cuisine: string;
  difficulty: string;
  cookingMethod: string;
  tags: string[];
  availableTags: string[];
};

function titleCase(value: string): string {
  return value.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

export function RecipeClassificationToolbar({
  recipeId,
  currentRevision,
  category,
  cuisine,
  difficulty,
  cookingMethod,
  tags,
  availableTags,
}: RecipeClassificationToolbarProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [newTag, setNewTag] = useState('');
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const categories = parseRecipeTaxonomyValues(category);
  const cuisines = parseRecipeTaxonomyValues(cuisine);

  async function saveTags(nextTags: string[], actionLabel: string) {
    setPendingTag(actionLabel);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: nextTags, expectedRevision: currentRevision }),
      });
      const body = (await response.json().catch(() => null)) as {
        recipe?: { currentRevision?: number };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.recipe?.currentRevision) {
        throw new Error(body?.error?.message ?? 'We could not update the recipe tags.');
      }
      setNewTag('');
      showToast(actionLabel, 'success');
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'We could not update the recipe tags.',
        'error',
      );
    } finally {
      setPendingTag(null);
    }
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = newTag.trim().toLocaleLowerCase();
    if (!normalized) return;
    if (tags.includes(normalized)) {
      showToast(`${titleCase(normalized)} is already attached to this recipe.`, 'info');
      return;
    }
    void saveTags([...tags, normalized], `${titleCase(normalized)} tag added.`);
  }

  return (
    <section className="recipe-classification-toolbar" aria-label="Recipe details and tags">
      <dl className="recipe-classification">
        {categories.length > 0 && (
          <div>
            <dt>{categories.length === 1 ? 'Category' : 'Categories'}</dt>
            <dd className="recipe-taxonomy-detail-values">
              {categories.map((item) => (
                <span key={item}>{titleCase(item)}</span>
              ))}
            </dd>
          </div>
        )}
        {cuisines.length > 0 && (
          <div>
            <dt>{cuisines.length === 1 ? 'Cuisine' : 'Cuisines'}</dt>
            <dd className="recipe-taxonomy-detail-values">
              {cuisines.map((item) => (
                <span key={item}>{titleCase(item)}</span>
              ))}
            </dd>
          </div>
        )}
        {difficulty && (
          <div>
            <dt>Difficulty</dt>
            <dd>{titleCase(difficulty)}</dd>
          </div>
        )}
        {cookingMethod && (
          <div>
            <dt>Method</dt>
            <dd>{titleCase(cookingMethod)}</dd>
          </div>
        )}
      </dl>

      <div className="recipe-tag-manager">
        <span className="recipe-tag-label">
          <Tag size={15} aria-hidden="true" /> Tags
        </span>
        <div className="recipe-tag-list" aria-label="Attached tags">
          {tags.length === 0 && <span className="recipe-tag-empty">None yet</span>}
          {tags.map((tag, index) => (
            <span
              className="recipe-tag-pill"
              key={tag}
              style={{ '--recipe-tag-hue': (78 + index * 47) % 360 } as CSSProperties}
            >
              {titleCase(tag)}
              <button
                type="button"
                disabled={pendingTag !== null}
                onClick={() =>
                  void saveTags(
                    tags.filter((current) => current !== tag),
                    `${titleCase(tag)} tag removed.`,
                  )
                }
                aria-label={`Remove ${tag} tag`}
              >
                {pendingTag === `${titleCase(tag)} tag removed.` ? (
                  <InlineSkeleton label={`Removing ${titleCase(tag)} tag`} width="0.75rem" />
                ) : (
                  <X size={12} aria-hidden="true" />
                )}
              </button>
            </span>
          ))}
        </div>
        <form className="recipe-add-tag" onSubmit={addTag}>
          <label className="sr-only" htmlFor="recipe-new-tag">
            Add a tag
          </label>
          <input
            id="recipe-new-tag"
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="Add tag"
            list="recipe-available-tags"
            maxLength={40}
            disabled={pendingTag !== null || tags.length >= 20}
          />
          <datalist id="recipe-available-tags">
            {availableTags
              .filter((tag) => !tags.includes(tag))
              .map((tag) => (
                <option value={tag} key={tag} />
              ))}
          </datalist>
          <button
            type="submit"
            disabled={pendingTag !== null || !newTag.trim() || tags.length >= 20}
            aria-label="Attach tag"
          >
            {pendingTag?.endsWith('tag added.') ? (
              <InlineSkeleton label="Adding tag" width="0.95rem" />
            ) : (
              <Plus size={15} aria-hidden="true" />
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
