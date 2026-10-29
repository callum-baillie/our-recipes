import 'server-only';
import { recipeIdFromCardUrl } from './recipe-link-service';
import { getProfile } from './household-service';
import { listPlannedMeals } from './planning-service';
import { getRecipe } from './recipe-service';
import { completePlannedRecipe } from './meal-completion-service';
import { ScannerError } from '@/lib/domain/scanner';
import { mealScanTiming } from '@/lib/domain/meal-completion';
import { nutritionWallTime } from '@/lib/domain/nutrition-ui';
import type { RequestPrincipal } from './auth-service';
export function completeScannedRecipeLink(
  command: { url: string; scannedAt: string; plannedFor?: string },
  principal: RequestPrincipal,
) {
  const recipeId = recipeIdFromCardUrl(command.url);
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new ScannerError('scanner_recipe_missing', 'This recipe is unavailable.');
  const profile = getProfile(principal.linkedProfileId);
  if (!profile)
    throw new ScannerError(
      'scanner_profile_missing',
      'The scanner account profile is unavailable.',
      403,
    );
  const scanned = new Date(command.scannedAt);
  if (scanned.getTime() > Date.now() + 60000 || scanned.getTime() < Date.now() - 7 * 86400000)
    throw new ScannerError(
      'scanner_scan_time_review',
      'Review this delayed recipe scan before logging a meal.',
    );
  const local = nutritionWallTime(scanned, profile.timezone);
  const date = command.plannedFor ?? local.slice(0, 10);
  const matches = listPlannedMeals(date, date).filter(
    (m) => m.recipeId === recipeId && m.kind === 'recipe' && m.effectiveStatus === 'planned',
  );
  const timingFor = (meal: (typeof matches)[number]) =>
    mealScanTiming(
      meal.meal,
      Number(local.slice(11, 13)) + Number(local.slice(14, 16)) / 60,
      recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes,
    );
  const inWindow = matches.filter((meal) => timingFor(meal) === 'meal');
  const meal = inWindow.length === 1 ? inWindow[0] : matches.length === 1 ? matches[0] : null;
  if (!meal)
    throw new ScannerError(
      'scanner_meal_match_review',
      `Review ${recipe.title} for ${date}: ${matches.length ? 'more than one planned occurrence matches' : 'there is no unmade matching planned meal'}.`,
    );
  const timing = timingFor(meal);
  if (timing !== 'meal')
    throw new ScannerError(
      'scanner_meal_time_review',
      timing === 'preparing'
        ? `Are you preparing ${recipe.title} for ${meal.meal}? Confirm when it has been eaten; no portions were logged.`
        : `Did you have ${recipe.title} for ${meal.meal}? This scan is outside its usual meal time; confirm in the recipe before logging portions.`,
    );
  const result = completePlannedRecipe(
    { recipeId, mealPlanEntryId: meal.id, portions: [] },
    {
      profileId: principal.linkedProfileId,
      source: principal.kind === 'api-key' ? 'api-key' : 'auth-session',
    },
    principal.userId,
    scanned,
  );
  return {
    cookSessionId: result.cookSessionId,
    message: `Made ${recipe.title} for ${meal.meal}. ${result.loggedPortions} planned portions logged.${result.missingPortions.length ? ' Open the recipe to assign missing portions.' : ''}${result.nutritionReview ? ' Nutrition needs review.' : ''}${result.pantryReview ? ' Pantry deductions need review.' : ''}`,
  };
}
