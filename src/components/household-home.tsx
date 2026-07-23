import { CalendarDays, ChevronRight, FolderHeart, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { AddRecipeDialog, AddRecipeTrigger } from '@/components/add-recipe-dialog';
import { HomeRecipeFilters, type HomeFilters } from '@/components/home-recipe-filters';
import { RecipeSummaryCard, type RecipeSummaryCardData } from '@/components/recipe-summary-card';
import type { CollectionSummary } from '@/lib/services/collection-service';
import type { HouseholdRecord } from '@/lib/services/household-service';

type NextMeal = {
  plannedFor: string;
  meal: string;
  title: string;
  recipe: RecipeSummaryCardData | null;
};

type HouseholdHomeProps = {
  household: HouseholdRecord;
  activeProfileName: string;
  addRecipeOpen: boolean;
  recentRecipes: RecipeSummaryCardData[];
  recipes: RecipeSummaryCardData[];
  recipeTotal: number;
  collections: CollectionSummary[];
  tags: string[];
  filters: HomeFilters;
  nextMeal: NextMeal | null;
};

function displayMealDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

export function HouseholdHome({
  household,
  activeProfileName,
  addRecipeOpen,
  recentRecipes,
  recipes,
  recipeTotal,
  collections,
  tags,
  filters,
  nextMeal,
}: HouseholdHomeProps) {
  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">{household.kitchenName.toUpperCase()} · THE SHARED COOKBOOK</p>
          <h1 id="home-title">Welcome to the kitchen, {activeProfileName}.</h1>
          <p>
            Keep the recipes you actually cook, plan the week around them, and share one calm
            kitchen notebook with your household.
          </p>
          <div className="home-actions">
            <AddRecipeTrigger open={addRecipeOpen} />
          </div>
        </div>

        <aside className="home-plan-card" aria-label="Upcoming meal plan">
          {nextMeal ? (
            <>
              <div className="home-plan-heading">
                <span className="home-plan-icon" aria-hidden="true">
                  <CalendarDays size={19} />
                </span>
                <div>
                  <span>Up next in your meal plan</span>
                  <strong>{displayMealDate(nextMeal.plannedFor)}</strong>
                </div>
              </div>
              {nextMeal.recipe ? (
                <RecipeSummaryCard recipe={nextMeal.recipe} compact />
              ) : (
                <Link className="home-freeform-meal" href="/planner">
                  <span>{nextMeal.meal}</span>
                  <strong>{nextMeal.title}</strong>
                  <ChevronRight size={19} aria-hidden="true" />
                </Link>
              )}
              <Link className="text-button" href="/planner">
                View meal plan <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <div className="home-plan-empty">
              <span className="home-plan-icon" aria-hidden="true">
                <CalendarDays size={20} />
              </span>
              <p className="eyebrow">MEAL PLANNING</p>
              <h2>Make the week feel lighter.</h2>
              <p>Choose a few trusted recipes now and make shopping and dinner easier later.</p>
              <Link className="primary-button compact" href="/planner">
                Set up your meal plan
              </Link>
            </div>
          )}
        </aside>
      </section>

      <section className="home-library-section recent-recipes" aria-labelledby="recent-title">
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">JUST ADDED</p>
            <h2 id="recent-title">Recent recipes</h2>
          </div>
          <Link className="text-button" href="/recipes?sort=recently-added">
            View library <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {recentRecipes.length ? (
          <div className="home-recipe-grid recent-grid">
            {recentRecipes.map((recipe) => (
              <RecipeSummaryCard recipe={recipe} key={recipe.id} />
            ))}
          </div>
        ) : (
          <div className="home-empty-state">
            <h3>Your first favorite belongs here.</h3>
            <p>Add a recipe from scratch, a URL, pasted text, or a photo.</p>
            <AddRecipeTrigger open={addRecipeOpen} />
          </div>
        )}
      </section>

      <section className="home-library-section all-recipes" aria-labelledby="all-recipes-title">
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">THE SHARED COOKBOOK</p>
            <h2 id="all-recipes-title">All recipes</h2>
            <span>
              {recipeTotal} recipe{recipeTotal === 1 ? '' : 's'} found
            </span>
          </div>
          <Link className="text-button" href="/recipes">
            Advanced filters <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <HomeRecipeFilters filters={filters} tags={tags} />
        {recipes.length ? (
          <div className="home-recipe-grid all-recipes-grid">
            {recipes.map((recipe) => (
              <RecipeSummaryCard recipe={recipe} key={recipe.id} />
            ))}
          </div>
        ) : (
          <div className="home-empty-state">
            <h3>No recipes matched those filters.</h3>
            <p>Try a broader search or clear the current filters.</p>
            <Link className="text-button" href="/">
              Clear filters
            </Link>
          </div>
        )}
        {recipeTotal > recipes.length ? (
          <Link className="home-view-all primary-button" href="/recipes">
            View all {recipeTotal} recipes
          </Link>
        ) : null}
      </section>

      <section
        className="home-library-section home-collections"
        aria-labelledby="collections-title"
      >
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">YOUR RECIPE SHELVES</p>
            <h2 id="collections-title">Collections</h2>
          </div>
          <Link className="text-button" href="/collections">
            Manage collections <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {collections.length ? (
          <div className="home-collection-grid">
            {collections.map((collection) => (
              <Link href={`/collections/${collection.id}`} key={collection.id}>
                <span className="collection-card-media">
                  {collection.coverImage ? (
                    <Image
                      src={`/api/v1/recipes/${collection.coverImage.recipeId}/images/${collection.coverImage.id}`}
                      alt={collection.coverImage.altText || `${collection.name} cover`}
                      width={collection.coverImage.width}
                      height={collection.coverImage.height}
                      sizes="(max-width: 700px) 100vw, 33vw"
                    />
                  ) : (
                    <span aria-hidden="true">
                      <FolderHeart size={30} />
                    </span>
                  )}
                </span>
                <span>
                  <strong>{collection.name}</strong>
                  <small>
                    {collection.recipeCount} recipe{collection.recipeCount === 1 ? '' : 's'}
                  </small>
                  {collection.description ? <p>{collection.description}</p> : null}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="home-empty-state collection-empty">
            <span aria-hidden="true">
              <FolderHeart size={24} />
            </span>
            <div>
              <h3>Build a shelf for the recipes you repeat.</h3>
              <p>Group weeknight dinners, family favorites, baking projects, or anything else.</p>
            </div>
            <Link className="text-button" href="/collections">
              <Plus size={16} aria-hidden="true" /> Create a collection
            </Link>
          </div>
        )}
      </section>

      <AddRecipeDialog open={addRecipeOpen} />
    </main>
  );
}
