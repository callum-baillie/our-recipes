import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import { recipeImages, recipes } from '@/lib/db/schema';
import { RecipeNotFoundError } from '@/lib/services/recipe-service';
import {
  readRecipeImage,
  removeRecipeImage,
  storeRecipeImage,
} from '@/lib/storage/recipe-image-storage';

export type RecipeImageRecord = typeof recipeImages.$inferSelect;

export class RecipeImageNotFoundError extends Error {}

function findImage(recipeId: string, imageId: string): RecipeImageRecord {
  const image = getDatabase().select().from(recipeImages).where(eq(recipeImages.id, imageId)).get();
  if (!image || image.recipeId !== recipeId) {
    throw new RecipeImageNotFoundError('That recipe photo no longer exists.');
  }
  return image;
}

export async function createRecipeImage(
  recipeId: string,
  actorProfileId: string,
  bytes: Uint8Array,
  altText: string,
): Promise<RecipeImageRecord> {
  ensureDatabase();
  const db = getDatabase();
  const recipe = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipeId)).get();
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  const id = randomUUID();
  const stored = await storeRecipeImage(id, bytes);
  try {
    const image: RecipeImageRecord = {
      id,
      recipeId,
      storageKey: stored.storageKey,
      altText,
      width: stored.width,
      height: stored.height,
      createdByProfileId: actorProfileId,
      createdAt: new Date(),
    };
    db.insert(recipeImages).values(image).run();
    return image;
  } catch (error) {
    await removeRecipeImage(stored.storageKey);
    throw error;
  }
}

export async function getRecipeImageFile(
  recipeId: string,
  imageId: string,
): Promise<{ image: RecipeImageRecord; data: Buffer }> {
  ensureDatabase();
  const image = findImage(recipeId, imageId);
  try {
    return { image, data: await readRecipeImage(image.storageKey) };
  } catch {
    throw new RecipeImageNotFoundError('That recipe photo is no longer available.');
  }
}

export async function deleteRecipeImage(recipeId: string, imageId: string): Promise<void> {
  ensureDatabase();
  const image = findImage(recipeId, imageId);
  await removeRecipeImage(image.storageKey);
  getDatabase().delete(recipeImages).where(eq(recipeImages.id, image.id)).run();
}
