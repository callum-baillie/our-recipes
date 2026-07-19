import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import { RecipeForm } from '@/components/recipe-form';
import { getRecipe } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const recipe = getRecipe(recipeId);
  if (!recipe) notFound();
  return (
    <main className="recipe-page">
      <section className="editor-layout">
        <RecipeForm
          intro={
            <>
              <Link className="quiet-link editor-back-link" href={`/recipes/${recipe.id}`}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to recipe
              </Link>
              <div className="editor-title-copy">
                <p className="eyebrow">REVISION {recipe.currentRevision + 1}</p>
                <h1>Make it yours.</h1>
                <p className="muted">
                  Saving changes keeps the previous recipe card in its revision history.
                </p>
              </div>
            </>
          }
          recipeId={recipe.id}
          initial={{
            title: recipe.title,
            summary: recipe.summary,
            status: recipe.status,
            servings: recipe.servings,
            prepMinutes: recipe.prepMinutes,
            cookMinutes: recipe.cookMinutes,
            restMinutes: recipe.restMinutes,
            difficulty: recipe.difficulty,
            cuisine: recipe.cuisine,
            category: recipe.category,
            tips: recipe.tips,
            sharedNotes: recipe.sharedNotes,
            sourceName: recipe.sourceName || '',
            sourceUrl: recipe.sourceUrl || '',
            originalAuthor: recipe.originalAuthor || '',
            cookingMethod: recipe.cookingMethod,
            equipment: recipe.equipment.map((item) => item.name),
            nutritionCalories: recipe.nutritionCalories ?? '',
            nutritionProteinGrams: recipe.nutritionProteinGrams ?? '',
            nutritionCarbohydrateGrams: recipe.nutritionCarbohydrateGrams ?? '',
            nutritionFatGrams: recipe.nutritionFatGrams ?? '',
            nutritionSaturatedFatGrams: recipe.nutritionSaturatedFatGrams ?? '',
            nutritionFiberGrams: recipe.nutritionFiberGrams ?? '',
            nutritionSugarGrams: recipe.nutritionSugarGrams ?? '',
            nutritionSodiumMilligrams: recipe.nutritionSodiumMilligrams ?? '',
            tags: recipe.tags,
            ingredientGroups: recipe.ingredientGroups.map((group) => ({
              name: group.name,
              ingredients: group.ingredients.map((ingredient) => ({
                quantity: ingredient.quantity ?? '',
                unit: ingredient.unit,
                item: ingredient.item,
                note: ingredient.note,
              })),
            })),
            instructionSections: recipe.instructionSections.map((section) => ({
              title: section.title,
              steps: section.steps.map((step) => step.body),
            })),
          }}
          currentRevision={recipe.currentRevision}
        />
      </section>
    </main>
  );
}
