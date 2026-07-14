import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { CookingMode } from '@/components/cooking-mode';
import { isFavorite } from '@/lib/services/cooking-service';
import { getRecipe } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default async function CookRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const recipe = getRecipe((await params).recipeId);
  if (!recipe) notFound();
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return (
    <CookingMode
      recipe={recipe}
      initialFavorite={actor.profileId ? isFavorite(recipe.id, actor.profileId) : false}
    />
  );
}
