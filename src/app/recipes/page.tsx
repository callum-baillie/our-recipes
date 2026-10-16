import { PageHeader } from '@/components/page-header';
import { DecisionAssistance } from '@/components/decision-assistance';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { KitchenPrintDialog } from '@/components/kitchen-print-dialog';
import { RecipebookInsights } from '@/components/recipebook-insights';
import { RecipeLibraryFilters } from '@/components/recipe-library-filters';
import { RecipebookNav } from '@/components/recipebook-nav';
import { RecipeSummaryCard } from '@/components/recipe-summary-card';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { DEFAULT_NUTRITION_CARD_NUTRIENTS } from '@/lib/domain/nutrition-profile';
import { recipeLibraryQuerySchema } from '@/lib/domain/recipe';
import { listCollections } from '@/lib/services/collection-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { listRecipePantryAvailability } from '@/lib/services/pantry-availability-service';
import { listRecipeNutritionPresentations } from '@/lib/services/nutrition-recipe-calculation-service';
import { listAccessibleNutritionProfiles } from '@/lib/services/nutrition-profile-service';
import { getAppPreferences } from '@/lib/services/app-preferences-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import {
  getRecipebookInsightData,
  listRecipeLibrary,
  listRecipeTags,
} from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_NUTRITION_FIELDS = DEFAULT_NUTRITION_CARD_NUTRIENTS;
const NUTRITION_FIELD_LABELS = {
  energy_kcal: { label: 'Calories', unit: 'kcal', digits: 0 },
  protein: { label: 'Protein', unit: 'g', digits: 1 },
  carbohydrate: { label: 'Carbohydrate', unit: 'g', digits: 1 },
  total_fat: { label: 'Fat', unit: 'g', digits: 1 },
  fiber: { label: 'Fiber', unit: 'g', digits: 1 },
  sodium: { label: 'Sodium', unit: 'mg', digits: 0 },
} as const;

function recipeLibraryUrl(search: URLSearchParams, page: number): string {
  const next = new URLSearchParams(search);
  next.set('page', String(page));
  return `/recipes?${next.toString()}`;
}

export default async function RecipeLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawSearch = await searchParams;
  const search = new URLSearchParams(
    Object.entries(rawSearch).flatMap(([key, value]) =>
      typeof value === 'string'
        ? value
          ? [[key, value]]
          : []
        : Array.isArray(value)
          ? value.filter(Boolean).map((item) => [key, item])
          : [],
    ),
  );
  search.delete('nutritionProfile');
  search.delete('profileId');
  const recipePreferences = getAppPreferences().recipes;
  const query = recipeLibraryQuerySchema.parse({
    ...Object.fromEntries(search.entries()),
    sort: search.get('sort') ?? recipePreferences.defaultSort,
    nutritionFields: rawSearch.nutritionFields,
  });
  const cookieStore = await cookies();
  const actor = getActorContext(cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value);
  const nutritionHousehold = resolveNutritionHouseholdContext(actor);
  const activeNutritionProfile = listAccessibleNutritionProfiles(
    nutritionHousehold.compatibilityPrincipalId,
  ).find((profile) => profile.id === nutritionHousehold.activeNutritionProfile.id)!;
  const selectedNutritionFields = query.nutritionFields ??
    activeNutritionProfile?.recipeCardNutrientCodes ?? [...DEFAULT_NUTRITION_FIELDS];
  const showRecipeCardNutrition = activeNutritionProfile?.showRecipeCardNutrition ?? true;
  const { profiles } = getHouseholdState();
  const tags = listRecipeTags();
  const collections = listCollections();
  const pageSize = 24;
  const firstLibraryPage = listRecipeLibrary(
    { ...query, page: query.pantry ? 1 : query.page },
    actor.profileId,
    query.pantry ? 500 : pageSize,
  );
  const candidateRecipes = query.pantry
    ? [
        ...firstLibraryPage.recipes,
        ...Array.from({ length: firstLibraryPage.totalPages - 1 }, (_, index) => index + 2).flatMap(
          (page) => listRecipeLibrary({ ...query, page }, actor.profileId, 500).recipes,
        ),
      ]
    : firstLibraryPage.recipes;
  const pantryAvailability = Object.assign(
    {},
    ...Array.from({ length: Math.ceil(candidateRecipes.length / 500) }, (_, index) =>
      listRecipePantryAvailability(
        candidateRecipes.slice(index * 500, index * 500 + 500).map((recipe) => recipe.id),
      ),
    ),
  );
  const filteredRecipes = query.pantry
    ? candidateRecipes.filter((recipe) => pantryAvailability[recipe.id]?.state === query.pantry)
    : candidateRecipes;
  const filteredTotalPages = Math.max(1, Math.ceil(filteredRecipes.length / pageSize));
  const filteredPage = Math.min(query.page, filteredTotalPages);
  const library = query.pantry
    ? {
        ...firstLibraryPage,
        recipes: filteredRecipes.slice((filteredPage - 1) * pageSize, filteredPage * pageSize),
        total: filteredRecipes.length,
        page: filteredPage,
        totalPages: filteredTotalPages,
      }
    : firstLibraryPage;
  const nutritionPresentations = showRecipeCardNutrition
    ? listRecipeNutritionPresentations(library.recipes.map((recipe) => recipe.id))
    : {};
  const eagerRecipeId = library.recipes.find((recipe) => recipe.image)?.id;
  return (
    <main className="recipe-page">
      <div className="library-heading">
        <PageHeader
          title="Your recipe library"
          titleId="library-title"
          eyebrow="THE SHARED COOKBOOK"
          description={
            library.total
              ? `${library.total} recipe${library.total === 1 ? '' : 's'} ready for the kitchen.`
              : 'A place for every recipe your household returns to.'
          }
          actions={
            <KitchenPrintDialog
              kind="recipes"
              browse
              recipes={library.recipes.map(({ id, title }) => ({ id, title }))}
            />
          }
          toolbarLeft={
            <nav className="kitchen-quick-views" aria-label="Recipe shortcuts">
              <Link
                href="/recipes"
                aria-current={
                  !query.favorite && !query.pantry && !query.maxTotalMinutes ? 'page' : undefined
                }
              >
                All recipes
              </Link>
              <Link
                href="/recipes?favorite=true"
                aria-current={query.favorite ? 'page' : undefined}
              >
                Favourites
              </Link>
              <Link
                href="/recipes?pantry=ready"
                aria-current={query.pantry === 'ready' ? 'page' : undefined}
              >
                Ready to cook
              </Link>
              <Link
                href="/recipes?maxTotalMinutes=30"
                aria-current={query.maxTotalMinutes === 30 ? 'page' : undefined}
              >
                30 minutes or less
              </Link>
            </nav>
          }
          toolbarRight={<RecipebookNav current="library" />}
        >
          <RecipeLibraryFilters
            filters={{
              q: query.q,
              sort: query.sort,
              creator: query.creator ?? '',
              tag: query.tag ?? '',
              collection: query.collection ?? '',
              status: query.status,
              category: query.category ?? '',
              cuisine: query.cuisine ?? '',
              maxTotalMinutes: query.maxTotalMinutes ?? '',
              favorite: Boolean(query.favorite),
              cooked: Boolean(query.cooked),
              pantry: query.pantry ?? '',
              maxCaloriesPerServing: query.maxCaloriesPerServing ?? '',
              minProteinPerServing: query.minProteinPerServing ?? '',
              minFiberPerServing: query.minFiberPerServing ?? '',
              maxSodiumPerServing: query.maxSodiumPerServing ?? '',
              minNutritionCompleteness: query.minNutritionCompleteness ?? '',
              supportsNutrient: query.supportsNutrient ?? '',
              nutritionFields: selectedNutritionFields,
            }}
            profiles={profiles.map((profile) => ({
              value: profile.id,
              label: profile.displayName,
            }))}
            tags={tags}
            collections={collections.map((collection) => ({
              value: collection.id,
              label: collection.name,
            }))}
          />
        </PageHeader>
        <DecisionAssistance
          embedded
          initialTask="cleanup"
          tasks={['cleanup', 'recipe_review']}
          title="Library maintenance"
          description="Review saved recipes in batches for missing nutrition and unclear details. Open a recipe for ingredient matching and individual changes."
        />
        {activeNutritionProfile && !showRecipeCardNutrition ? (
          <p className="muted">
            Compact Nutrition facts are hidden in {activeNutritionProfile.displayName}&apos;s
            Nutrition settings.
          </p>
        ) : null}
      </div>
      <RecipebookInsights recipes={getRecipebookInsightData()} />
      {library.recipes.length ? (
        <>
          <section
            className="home-recipe-grid all-recipes-grid library-recipe-grid"
            aria-label="Recipe results"
          >
            {library.recipes.map((recipe) => (
              <RecipeSummaryCard
                recipe={{
                  ...recipe,
                  pantryAvailability: pantryAvailability[recipe.id]?.state,
                  pantryInsight: pantryAvailability[recipe.id]
                    ? `${pantryAvailability[recipe.id]!.counts.ready} covered · ${pantryAvailability[recipe.id]!.counts.partial} short · ${pantryAvailability[recipe.id]!.counts.unknown} unknown`
                    : undefined,
                  normalizedNutrition: (() => {
                    if (!showRecipeCardNutrition) return undefined;
                    const presentation = nutritionPresentations[recipe.id];
                    if (!presentation) return undefined;
                    return {
                      status: presentation.status,
                      completeness: presentation.completeness,
                      facts: selectedNutritionFields.flatMap((code) => {
                        const amount = presentation.values.find(
                          (value) => value.nutrientCode === code,
                        )?.perServing;
                        const metadata = NUTRITION_FIELD_LABELS[code];
                        return amount === null || amount === undefined
                          ? []
                          : [{ code, amount, ...metadata }];
                      }),
                    };
                  })(),
                }}
                eager={recipe.id === eagerRecipeId}
                key={recipe.id}
              />
            ))}
          </section>
          {library.totalPages > 1 && (
            <nav className="pagination" aria-label="Recipe library pages">
              {library.page > 1 ? (
                <Link className="text-button" href={recipeLibraryUrl(search, library.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {library.page} of {library.totalPages}
              </span>
              {library.page < library.totalPages ? (
                <Link className="text-button" href={recipeLibraryUrl(search, library.page + 1)}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : (
        <section className="empty-library">
          <h2>
            {query.q || search.size ? 'Nothing matched those filters.' : 'The recipe box is empty.'}
          </h2>
          <p>
            {query.q || search.size
              ? 'Try a broader search or reset the filters.'
              : 'Start with a recipe your household already loves.'}
          </p>
          {query.q || search.size ? (
            <Link className="text-button" href="/recipes">
              Clear filters
            </Link>
          ) : (
            <Link className="primary-button" href="/recipes/new">
              Add the first recipe
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
