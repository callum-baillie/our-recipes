'use client';

import { ChevronDown, ChevronUp, FolderPlus, Save, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

import type { CollectionDetail } from '@/lib/services/collection-service';

type RecipeOption = { id: string; title: string };

export function CollectionDetailManager({
  initialCollection,
  recipes,
}: {
  initialCollection: CollectionDetail;
  recipes: RecipeOption[];
}) {
  const router = useRouter();
  const [collection, setCollection] = useState(initialCollection);
  const [name, setName] = useState(initialCollection.name);
  const [description, setDescription] = useState(initialCollection.description);
  const [coverImageId, setCoverImageId] = useState(initialCollection.coverImageId ?? '');
  const [recipeId, setRecipeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const availableRecipes = useMemo(
    () => recipes.filter((recipe) => !collection.recipes.some((member) => member.id === recipe.id)),
    [collection.recipes, recipes],
  );

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, coverImageId }),
      });
      const body = (await response.json().catch(() => null)) as {
        collection?: Pick<CollectionDetail, 'name' | 'description' | 'coverImageId' | 'coverImage'>;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.collection) {
        setError(body?.error?.message ?? 'We could not save this collection.');
        return;
      }
      setCollection((current) => ({ ...current, ...body.collection! }));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function saveRecipes(recipeIds: string[]) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/collections/${collection.id}/recipes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeIds }),
      });
      const body = (await response.json().catch(() => null)) as {
        collection?: CollectionDetail;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.collection) {
        setError(body?.error?.message ?? 'We could not save the recipe order.');
        return;
      }
      setCollection(body.collection);
      setCoverImageId(body.collection.coverImageId ?? '');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipeId) return;
    void saveRecipes([...collection.recipes.map((recipe) => recipe.id), recipeId]);
    setRecipeId('');
  }

  function moveRecipe(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= collection.recipes.length) return;
    const next = [...collection.recipes];
    [next[index], next[target]] = [next[target]!, next[index]!];
    void saveRecipes(next.map((recipe) => recipe.id));
  }

  return (
    <main className="settings-page collection-page">
      <header className="collection-detail-header">
        <Link className="quiet-link" href="/collections">
          ← All collections
        </Link>
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
      </header>
      <section className="settings-intro">
        <p className="eyebrow">CURATED COLLECTION</p>
        <h1>{collection.name}</h1>
        <p>
          {collection.description ||
            'Arrange recipes into a cookbook your household can return to.'}
        </p>
      </section>
      <section className="settings-card">
        <h2>Collection details</h2>
        <form className="collection-detail-form" onSubmit={saveDetails}>
          <label>
            <span>Collection name</span>
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>
              A small note <em>(optional)</em>
            </span>
            <textarea
              value={description}
              rows={3}
              maxLength={800}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            <span>Cover photo</span>
            <select value={coverImageId} onChange={(event) => setCoverImageId(event.target.value)}>
              <option value="">A simple shelf cover</option>
              {collection.availableImages.map((image) => {
                const recipe = collection.recipes.find(
                  (candidate) => candidate.id === image.recipeId,
                );
                return (
                  <option key={image.id} value={image.id}>
                    {recipe?.title ?? 'Recipe'} — {image.altText || 'saved photo'}
                  </option>
                );
              })}
            </select>
          </label>
          <p className="muted">
            Choose only from photos already kept safely with a recipe in this collection.
          </p>
          <button className="text-button" type="submit" disabled={pending || !name.trim()}>
            <Save size={16} /> Save collection
          </button>
        </form>
      </section>
      <section
        className="settings-card collection-recipe-manager"
        aria-labelledby="collection-recipes-title"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">THE RECIPE SHELF</p>
            <h2 id="collection-recipes-title">Recipes in order</h2>
          </div>
          <span>{collection.recipes.length} saved</span>
        </div>
        <form className="collection-add-recipe" onSubmit={addRecipe}>
          <label>
            <span className="sr-only">Recipe to add</span>
            <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              <option value="">Choose a recipe to add</option>
              {availableRecipes.map((recipe) => (
                <option value={recipe.id} key={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button compact" type="submit" disabled={pending || !recipeId}>
            <FolderPlus size={16} /> Add recipe
          </button>
        </form>
        {collection.recipes.length ? (
          <ol className="collection-recipe-list">
            {collection.recipes.map((recipe, index) => (
              <li key={recipe.id}>
                <div>
                  <Link href={`/recipes/${recipe.id}`}>{recipe.title}</Link>
                  <span>{recipe.summary || recipe.status}</span>
                </div>
                <div className="reorder-actions" aria-label={`${recipe.title} collection order`}>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={pending || index === 0}
                    onClick={() => moveRecipe(index, -1)}
                    aria-label={`Move ${recipe.title} up`}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={pending || index === collection.recipes.length - 1}
                    onClick={() => moveRecipe(index, 1)}
                    aria-label={`Move ${recipe.title} down`}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="icon-button danger-icon-button"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void saveRecipes(
                        collection.recipes
                          .filter((candidate) => candidate.id !== recipe.id)
                          .map((candidate) => candidate.id),
                      )
                    }
                    aria-label={`Remove ${recipe.title} from ${collection.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Add a recipe, then order the shelf with the arrow controls.</p>
        )}
      </section>
      {collection.coverImage && (
        <figure className="collection-cover-preview">
          <Image
            src={`/api/v1/recipes/${collection.coverImage.recipeId}/images/${collection.coverImage.id}`}
            alt={collection.coverImage.altText || `${collection.name} cover`}
            width={collection.coverImage.width}
            height={collection.coverImage.height}
            unoptimized
          />
          <figcaption>Current collection cover</figcaption>
        </figure>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
