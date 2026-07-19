import { Settings2 } from 'lucide-react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { RecipeDetailToolbar } from '@/components/recipe-detail-toolbar';
import { RecipeImageGallery } from '@/components/recipe-image-gallery';
import { RecipeLifecycleActions } from '@/components/recipe-lifecycle-actions';
import { RecipeRevisionHistory } from '@/components/recipe-revision-history';
import { RecipeServingDetails } from '@/components/recipe-serving-details';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { listCollectionsForRecipe } from '@/lib/services/collection-service';
import { isFavorite } from '@/lib/services/cooking-service';
import { getRecipeImportProvenance } from '@/lib/services/import-service';
import { getRecipe, listTags } from '@/lib/services/recipe-service';

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
  const importProvenance = getRecipeImportProvenance(recipe.id);
  const availableTags = listTags().map((tag) => tag.name);
  const favorite = actor.profileId ? isFavorite(recipe.id, actor.profileId) : null;
  return (
    <main className="recipe-page recipe-detail">
      <article>
        <p className="eyebrow">
          {recipe.status === 'active' ? 'HOUSE RECIPE' : recipe.status.toUpperCase()}
        </p>
        <h1>{recipe.title}</h1>
        {recipe.summary && <p className="recipe-summary">{recipe.summary}</p>}
        <RecipeDetailToolbar recipeId={recipe.id} />
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
        <RecipeServingDetails
          key={recipe.currentRevision}
          servings={recipe.servings}
          prepMinutes={recipe.prepMinutes}
          cookMinutes={recipe.cookMinutes}
          restMinutes={recipe.restMinutes}
          category={recipe.category}
          cuisine={recipe.cuisine}
          difficulty={recipe.difficulty}
          cookingMethod={recipe.cookingMethod}
          recipeId={recipe.id}
          currentRevision={recipe.currentRevision}
          tags={recipe.tags}
          availableTags={availableTags}
          nutritionCalories={recipe.nutritionCalories}
          nutritionProteinGrams={recipe.nutritionProteinGrams}
          nutritionCarbohydrateGrams={recipe.nutritionCarbohydrateGrams}
          nutritionFatGrams={recipe.nutritionFatGrams}
          nutritionSaturatedFatGrams={recipe.nutritionSaturatedFatGrams}
          nutritionFiberGrams={recipe.nutritionFiberGrams}
          nutritionSugarGrams={recipe.nutritionSugarGrams}
          nutritionSodiumMilligrams={recipe.nutritionSodiumMilligrams}
          collections={collections.map(({ id, name }) => ({ id, name }))}
          ingredientGroups={recipe.ingredientGroups}
          instructionSections={recipe.instructionSections}
        />
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
        {(importProvenance || recipe.sourceName || recipe.sourceUrl || recipe.originalAuthor) && (
          <aside className="source-note">
            <strong>Recipe source</strong>
            <span title={importProvenance?.sourceName}>
              {recipe.sourceUrl ? (
                <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                  {importProvenance?.label || recipe.sourceName || recipe.sourceUrl}
                </a>
              ) : (
                importProvenance?.label || recipe.sourceName
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
        <section className="recipe-maintenance-panel" aria-labelledby="recipe-management-heading">
          <header className="recipe-maintenance-heading">
            <span className="recipe-maintenance-icon" aria-hidden="true">
              <Settings2 size={19} />
            </span>
            <div>
              <h2 id="recipe-management-heading">Recipe management</h2>
              <p>Keep the shared recipe tidy or return to an earlier saved version.</p>
            </div>
            <span className="recipe-revision-badge">Revision {recipe.currentRevision}</span>
          </header>
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
            Created by {recipe.createdByName} on {recipe.createdAt.toLocaleDateString()} · Last
            edited by {recipe.lastEditedByName} on {recipe.updatedAt.toLocaleDateString()}
          </footer>
        </section>
      </article>
    </main>
  );
}
