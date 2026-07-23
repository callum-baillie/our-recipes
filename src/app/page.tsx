import { cookies } from 'next/headers';

import { HouseholdHome } from '@/components/household-home';
import { AiSummaryCards } from '@/components/ai-summary-cards';
import type { RecipeSummaryCardData } from '@/components/recipe-summary-card';
import { SetupWizard } from '@/components/setup-wizard';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipeLibraryQuerySchema } from '@/lib/domain/recipe';
import { addLocalDateDays, localIsoDate } from '@/lib/domain/local-date';
import { ensureBackupScheduler } from '@/lib/services/backup-service';
import { listCollections } from '@/lib/services/collection-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { listPlannedMeals } from '@/lib/services/planning-service';
import { getRecipe, listRecipeLibrary, listRecipeTags } from '@/lib/services/recipe-service';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchParams = {
  add?: string;
  q?: string;
  category?: string;
  tag?: string;
  sort?: string;
};

function toCardRecipe(recipe: NonNullable<ReturnType<typeof getRecipe>>): RecipeSummaryCardData {
  return {
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    category: recipe.category,
    tags: recipe.tags,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes,
    personalRating: recipe.personalPreference?.rating ?? null,
    image: recipe.images[0]
      ? {
          id: recipe.images[0].id,
          altText: recipe.images[0].altText,
          width: recipe.images[0].width,
          height: recipe.images[0].height,
        }
      : null,
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  ensureBackupScheduler();
  const state = getHouseholdState();
  if (!state.household) return <SetupWizard />;

  const rawSearch = await searchParams;
  const recipePreferences = getAppPreferences().recipes;
  const parsedQuery = recipeLibraryQuerySchema.safeParse({
    q: rawSearch.q,
    category: rawSearch.category || undefined,
    tag: rawSearch.tag || undefined,
    sort: rawSearch.sort ?? recipePreferences.defaultSort,
    status: 'active',
    page: 1,
  });
  const query = parsedQuery.success
    ? parsedQuery.data
    : recipeLibraryQuerySchema.parse({ status: 'active', page: 1 });
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const activeProfile =
    state.profiles.find((profile) => profile.id === actor.profileId) ?? state.profiles[0];
  const recentRecipes = listRecipeLibrary(
    { q: '', status: 'active', sort: 'recently-added', page: 1 },
    actor.profileId,
    4,
  ).recipes;
  const library = listRecipeLibrary(query, actor.profileId, 48);
  const today = localIsoDate(new Date(), activeProfile?.timezone ?? 'UTC');
  const upcomingMeal = listPlannedMeals(today, addLocalDateDays(today, 365))[0] ?? null;
  const upcomingRecipe = upcomingMeal?.recipeId
    ? getRecipe(upcomingMeal.recipeId, actor.profileId)
    : null;

  return (
    <>
      <AiSummaryCards kinds={['daily_nutrition', 'weekly_nutrition', 'weekly_planning']} />
      <HouseholdHome
        household={state.household}
        activeProfileName={activeProfile?.displayName ?? 'there'}
        addRecipeOpen={rawSearch.add === 'recipe'}
        recentRecipes={recentRecipes}
        recipes={library.recipes}
        recipeTotal={library.total}
        collections={listCollections()}
        tags={listRecipeTags()}
        filters={{
          q: query.q,
          category: query.category ?? '',
          tag: query.tag ?? '',
          sort: query.sort,
        }}
        nextMeal={
          upcomingMeal
            ? {
                plannedFor: upcomingMeal.plannedFor,
                meal: upcomingMeal.meal,
                title: upcomingMeal.recipeTitle,
                recipe: upcomingRecipe ? toCardRecipe(upcomingRecipe) : null,
              }
            : null
        }
      />
    </>
  );
}
