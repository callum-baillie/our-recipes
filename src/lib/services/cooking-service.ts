import { desc, eq, and, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { cookSessions, recipeFavorites, recipes } from '@/lib/db/schema';

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
  if (favorite)
    db.insert(recipeFavorites)
      .values({ recipeId, profileId, createdAt: new Date() })
      .onConflictDoNothing()
      .run();
  else
    db.delete(recipeFavorites)
      .where(and(eq(recipeFavorites.recipeId, recipeId), eq(recipeFavorites.profileId, profileId)))
      .run();
  return favorite;
}

export function startCookSession(
  recipeId: string,
  profileId: string,
  targetServings: number,
): typeof cookSessions.$inferSelect {
  ensureDatabase();
  const recipe = getDatabase()
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .get();
  if (!recipe) throw new CookingNotFoundError('That recipe no longer exists.');
  const session: typeof cookSessions.$inferInsert = {
    id: randomUUID(),
    recipeId,
    profileId,
    targetServings,
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
