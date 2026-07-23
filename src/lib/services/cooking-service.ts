import { desc, eq, and, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  cookSessions,
  mealPlanEntries,
  recipeFavorites,
  recipeProfilePreferences,
  recipes,
} from '@/lib/db/schema';

export class CookingNotFoundError extends Error {}

export function isFavorite(recipeId: string, profileId: string): boolean {
  ensureDatabase();
  return Boolean(
    getDatabase()
      .select()
      .from(recipeFavorites)
      .where(and(eq(recipeFavorites.recipeId, recipeId), eq(recipeFavorites.profileId, profileId)))
      .get(),
  );
}

export function setFavorite(recipeId: string, profileId: string, favorite: boolean): boolean {
  ensureDatabase();
  const recipe = getDatabase()
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .get();
  if (!recipe) throw new CookingNotFoundError('That recipe no longer exists.');
  const db = getDatabase();
  const existingPreference = db
    .select({ rating: recipeProfilePreferences.rating, note: recipeProfilePreferences.note })
    .from(recipeProfilePreferences)
    .where(
      and(
        eq(recipeProfilePreferences.recipeId, recipeId),
        eq(recipeProfilePreferences.profileId, profileId),
      ),
    )
    .get();
  const updatedAt = new Date();
  db.transaction((tx) => {
    if (favorite) {
      tx.insert(recipeFavorites)
        .values({ recipeId, profileId, createdAt: updatedAt })
        .onConflictDoNothing()
        .run();
      tx.insert(recipeProfilePreferences)
        .values({
          recipeId,
          profileId,
          rating: existingPreference?.rating === 5 ? 5 : 3,
          note: existingPreference?.note ?? '',
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [recipeProfilePreferences.profileId, recipeProfilePreferences.recipeId],
          set: {
            rating: existingPreference?.rating === 5 ? 5 : 3,
            note: existingPreference?.note ?? '',
            updatedAt,
          },
        })
        .run();
    } else {
      tx.delete(recipeFavorites)
        .where(
          and(eq(recipeFavorites.recipeId, recipeId), eq(recipeFavorites.profileId, profileId)),
        )
        .run();
      if (
        existingPreference &&
        existingPreference.rating !== null &&
        existingPreference.rating >= 3
      ) {
        if (existingPreference.note) {
          tx.update(recipeProfilePreferences)
            .set({ rating: null, updatedAt })
            .where(
              and(
                eq(recipeProfilePreferences.recipeId, recipeId),
                eq(recipeProfilePreferences.profileId, profileId),
              ),
            )
            .run();
        } else {
          tx.delete(recipeProfilePreferences)
            .where(
              and(
                eq(recipeProfilePreferences.recipeId, recipeId),
                eq(recipeProfilePreferences.profileId, profileId),
              ),
            )
            .run();
        }
      }
    }
  });
  return favorite;
}

export function startCookSession(
  recipeId: string,
  profileId: string,
  targetServings: number,
  mealPlanEntryId: string | null = null,
): typeof cookSessions.$inferSelect {
  ensureDatabase();
  const recipe = getDatabase()
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .get();
  if (!recipe) throw new CookingNotFoundError('That recipe no longer exists.');
  if (mealPlanEntryId) {
    const meal = getDatabase()
      .select({ id: mealPlanEntries.id, recipeId: mealPlanEntries.recipeId })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, mealPlanEntryId))
      .get();
    if (!meal || meal.recipeId !== recipeId)
      throw new CookingNotFoundError('Choose a planned meal for this recipe.');
  }
  const session: typeof cookSessions.$inferInsert = {
    id: randomUUID(),
    recipeId,
    profileId,
    targetServings,
    mealPlanEntryId,
    startedAt: new Date(),
    completedAt: null,
  };
  getDatabase().insert(cookSessions).values(session).run();
  return getDatabase().select().from(cookSessions).where(eq(cookSessions.id, session.id)).get()!;
}

export function completeCookSession(sessionId: string, profileId: string): void {
  ensureDatabase();
  const result = getDatabase()
    .update(cookSessions)
    .set({ completedAt: new Date() })
    .where(and(eq(cookSessions.id, sessionId), eq(cookSessions.profileId, profileId)))
    .run();
  if (!result.changes) throw new CookingNotFoundError('That cooking session no longer exists.');
}

export function listCookHistory(profileId: string) {
  ensureDatabase();
  return getDatabase()
    .select()
    .from(cookSessions)
    .where(and(eq(cookSessions.profileId, profileId), isNotNull(cookSessions.completedAt)))
    .orderBy(desc(cookSessions.completedAt))
    .all();
}
