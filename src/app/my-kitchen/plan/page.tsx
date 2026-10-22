import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { z } from 'zod';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { readKitchenInventory, readKitchenClaims } from '@/lib/services/kitchen-inventory-service';
import { readCookingEpisode } from '@/lib/services/cooking-episode-service';
import { readCookingSessionRecipe } from '@/lib/services/cooking-session-recipe-service';
import { getRecipe } from '@/lib/services/recipe-service';
import { getRecipeForPlannedMeal } from '@/lib/services/planning-service';
import { KitchenMealPlanner } from '@/components/kitchen-meal-planner';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coordinate a meal · My Kitchen' };
export default async function KitchenPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/my-kitchen/plan', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  const kitchen = readKitchenInventory(principal);
  const raw = (await searchParams).sessionId;
  if (raw && !z.uuid().safeParse(raw).success) notFound();
  let episode, session;
  try {
    episode = raw ? readCookingEpisode(principal, raw) : null;
    session = raw ? readCookingSessionRecipe(principal, raw) : null;
  } catch (error) {
    if (error instanceof DecisionError && [403, 404].includes(error.status)) notFound();
    throw error;
  }
  const sources = session?.effectiveRecipe ? [session.effectiveRecipe] : [];
  for (const phase of episode?.acceptedPlan?.request.phases ?? []) {
    if (sources.some((recipe) => recipe.id === phase.recipeId)) continue;
    const recipe = phase.mealPlanEntryId
      ? getRecipeForPlannedMeal(phase.recipeId, phase.mealPlanEntryId)
      : getRecipe(phase.recipeId);
    if (recipe) sources.push(recipe);
  }
  return (
    <KitchenMealPlanner
      key={`${principal.userId}:${principal.profileId}:${kitchen.id}:${raw ?? 'preview'}`}
      kitchen={kitchen}
      initialActivePhases={readKitchenClaims(principal)
        .filter((claim) => claim.episodeId === raw)
        .map((claim) => claim.phaseId)}
      initialUseIds={Object.fromEntries(
        readKitchenClaims(principal)
          .filter((claim) => claim.episodeId === raw)
          .map((claim) => [claim.phaseId, claim.useId!]),
      )}
      initialSources={sources}
      episode={
        episode
          ? {
              id: raw!,
              contextRevision: episode.contextRevision,
              acceptedPlan: episode.acceptedPlan,
              acceptedPlanState: episode.acceptedPlanState,
            }
          : null
      }
      sessionRevision={session?.effectiveRevision}
    />
  );
}
