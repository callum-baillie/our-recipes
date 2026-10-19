import { PageHeader } from '@/components/page-header';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getRecipePantryAvailability } from '@/lib/services/pantry-availability-service';
import { listPantryProducts } from '@/lib/services/pantry-service';
import { RecipeForm } from '@/components/recipe-form';
import { getRecipe, recipePayloadFromDetail } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const recipe = getRecipe(recipeId);
  if (!recipe) notFound();
  const availability = getRecipePantryAvailability(recipe.id);
  return (
    <main className="recipe-page">
      <section className="editor-layout">
        <RecipeForm
          intro={
            <PageHeader
              title={`Edit ${recipe.title}`}
              meta={`Saves as revision ${recipe.currentRevision + 1}`}
              description="Saving changes keeps the previous recipe card in its revision history."
              leading={
                <Link className="quiet-link editor-back-link" href={`/recipes/${recipe.id}`}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  Back to recipe
                </Link>
              }
            />
          }
          recipeId={recipe.id}
          linkedFoods={Object.fromEntries(
            listPantryProducts().map((product) => [product.id, product.displayName]),
          )}
          initial={{
            ...recipePayloadFromDetail(recipe),
            ingredientGroups: recipe.ingredientGroups.map((group) => ({
              name: group.name,
              ingredients: group.ingredients.map((ingredient) => ({
                quantity: ingredient.quantity ?? '',
                unit: ingredient.unit,
                item: ingredient.item,
                note: ingredient.note,
                shoppingCategory: ingredient.shoppingCategory || 'Other',
                pantryProductId:
                  availability.ingredients.find((entry) => entry.id === ingredient.id)?.productId ??
                  '',
              })),
            })),
          }}
          currentRevision={recipe.currentRevision}
        />
      </section>
    </main>
  );
}
