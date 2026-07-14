import { Clock3, Edit3 } from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { RecipeImageGallery } from '@/components/recipe-image-gallery';
import { RecipeLifecycleActions } from '@/components/recipe-lifecycle-actions';
import { RecipeRevisionHistory } from '@/components/recipe-revision-history';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { listCollectionsForRecipe } from '@/lib/services/collection-service';
import { isFavorite } from '@/lib/services/cooking-service';
import { getRecipe } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const recipe = getRecipe(recipeId, actor.profileId);
  if (!recipe) notFound();
  const collections = listCollectionsForRecipe(recipe.id);
  const favorite = actor.profileId ? isFavorite(recipe.id, actor.profileId) : null;
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes;
  return (
    <main className="recipe-page recipe-detail">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <div className="header-actions">
          <a className="text-button" href={`/api/v1/recipes/${recipe.id}/export`}>
            Export JSON-LD
          </a>
          <a className="text-button" href={`/api/v1/recipes/${recipe.id}/export/markdown`}>
            Export Markdown
          </a>
          <Link className="text-button" href={`/recipes/${recipe.id}/cook`}>
            Cook this recipe
          </Link>
          <Link className="primary-button compact" href={`/recipes/${recipe.id}/edit`}>
            <Edit3 size={15} /> Edit recipe
          </Link>
        </div>
      </header>
      <article>
        <p className="eyebrow">
          {recipe.status === 'active'
            ? recipe.tags.join(' · ') || 'HOUSE RECIPE'
            : recipe.status.toUpperCase()}
        </p>
        <h1>{recipe.title}</h1>
        {recipe.summary && <p className="recipe-summary">{recipe.summary}</p>}
        <RecipeImageGallery
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          images={recipe.images.map(({ id, altText, width, height }) => ({
            id,
            altText,
            width,
            height,
          }))}
        />
        <dl className="recipe-facts">
          <div>
            <dt>Serves</dt>
            <dd>{recipe.servings}</dd>
          </div>
          <div>
            <dt>Prep</dt>
            <dd>{recipe.prepMinutes} min</dd>
          </div>
          <div>
            <dt>Cook</dt>
            <dd>{recipe.cookMinutes} min</dd>
          </div>
          {recipe.restMinutes > 0 && (
            <div>
              <dt>Rest</dt>
              <dd>{recipe.restMinutes} min</dd>
            </div>
          )}
          <div>
            <dt>Total</dt>
            <dd>
              <Clock3 size={15} aria-hidden="true" /> {totalMinutes} min
            </dd>
          </div>
        </dl>
        {(recipe.category || recipe.cuisine || recipe.difficulty || recipe.cookingMethod) && (
          <dl className="recipe-classification">
            {recipe.category && (
              <div>
                <dt>Category</dt>
                <dd>{recipe.category}</dd>
              </div>
            )}
            {recipe.cuisine && (
              <div>
                <dt>Cuisine</dt>
                <dd>{recipe.cuisine}</dd>
              </div>
            )}
            {recipe.difficulty && (
              <div>
                <dt>Difficulty</dt>
                <dd>{recipe.difficulty}</dd>
              </div>
            )}
            {recipe.cookingMethod && (
              <div>
                <dt>Method</dt>
                <dd>{recipe.cookingMethod}</dd>
              </div>
            )}
          </dl>
        )}
        {collections.length > 0 && (
          <aside className="recipe-notes collection-links">
            <strong>In these collections</strong>
            <div>
              {collections.map((collection) => (
                <Link href={`/collections/${collection.id}`} key={collection.id}>
                  {collection.name}
                </Link>
              ))}
            </div>
          </aside>
        )}
        <div className="recipe-body">
          <section>
            <h2>Ingredients</h2>
            {recipe.ingredientGroups.map((group) => (
              <div className="ingredient-group" key={group.id}>
                {group.name && <h3>{group.name}</h3>}
                <ul>
                  {group.ingredients.map((ingredient) => (
                    <li key={ingredient.id}>
                      <span>
                        {ingredient.quantity ?? ''} {ingredient.unit}
                      </span>{' '}
                      {ingredient.item}
                      {ingredient.note && <em> — {ingredient.note}</em>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          <section>
            <h2>Method</h2>
            {recipe.instructionSections.map((section) => (
              <div className="instruction-section" key={section.id}>
                {section.title && <h3>{section.title}</h3>}
                <ol>
                  {section.steps.map((step) => (
                    <li key={step.id}>{step.body}</li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </div>
        {recipe.equipment.length > 0 && (
          <aside className="recipe-notes equipment-note">
            <strong>Equipment</strong>
            <ul>
              {recipe.equipment.map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </aside>
        )}
        {(recipe.nutritionCalories !== null ||
          recipe.nutritionProteinGrams !== null ||
          recipe.nutritionCarbohydrateGrams !== null ||
          recipe.nutritionFatGrams !== null ||
          recipe.nutritionFiberGrams !== null) && (
          <aside className="recipe-notes nutrition-note">
            <strong>Nutrition as entered</strong>
            <dl>
              {recipe.nutritionCalories !== null && (
                <div>
                  <dt>Calories</dt>
                  <dd>{recipe.nutritionCalories} kcal</dd>
                </div>
              )}
              {recipe.nutritionProteinGrams !== null && (
                <div>
                  <dt>Protein</dt>
                  <dd>{recipe.nutritionProteinGrams} g</dd>
                </div>
              )}
              {recipe.nutritionCarbohydrateGrams !== null && (
                <div>
                  <dt>Carbohydrates</dt>
                  <dd>{recipe.nutritionCarbohydrateGrams} g</dd>
                </div>
              )}
              {recipe.nutritionFatGrams !== null && (
                <div>
                  <dt>Fat</dt>
                  <dd>{recipe.nutritionFatGrams} g</dd>
                </div>
              )}
              {recipe.nutritionFiberGrams !== null && (
                <div>
                  <dt>Fiber</dt>
                  <dd>{recipe.nutritionFiberGrams} g</dd>
                </div>
              )}
            </dl>
          </aside>
        )}
        {(recipe.sourceName || recipe.sourceUrl || recipe.originalAuthor) && (
          <aside className="source-note">
            <strong>Recipe source</strong>
            <span>
              {recipe.sourceUrl ? (
                <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                  {recipe.sourceName || recipe.sourceUrl}
                </a>
              ) : (
                recipe.sourceName
              )}
            </span>
            {recipe.originalAuthor && <span>Original author: {recipe.originalAuthor}</span>}
          </aside>
        )}
        {(recipe.tips || recipe.sharedNotes) && (
          <aside className="recipe-notes">
            {recipe.tips && (
              <div>
                <strong>Kitchen tips</strong>
                <p>{recipe.tips}</p>
              </div>
            )}
            {recipe.sharedNotes && (
              <div>
                <strong>Shared notes</strong>
                <p>{recipe.sharedNotes}</p>
              </div>
            )}
          </aside>
        )}
        <RecipeLifecycleActions
          recipeId={recipe.id}
          status={recipe.status}
          currentRevision={recipe.currentRevision}
          personalPreference={recipe.personalPreference}
          initialFavorite={favorite}
        />
        <RecipeRevisionHistory
          recipeId={recipe.id}
          currentRevision={recipe.currentRevision}
          revisions={recipe.revisions.map((revision) => ({
            revision: revision.revision,
            editedByName: revision.editedByName,
            createdAt: revision.createdAt.toISOString(),
          }))}
        />
        <footer className="revision-note">
          Created by {recipe.createdByName} on {recipe.createdAt.toLocaleDateString()} · Last edited
          by {recipe.lastEditedByName} on {recipe.updatedAt.toLocaleDateString()} · Revision{' '}
          {recipe.currentRevision}
        </footer>
      </article>
    </main>
  );
}
