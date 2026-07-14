import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import { collectionRecipes, collections, recipeImages, recipes } from '@/lib/db/schema';
import type { CollectionInput } from '@/lib/domain/collection';

export type CollectionCoverImage = {
  id: string;
  recipeId: string;
  altText: string;
  width: number;
  height: number;
};

export type CollectionSummary = typeof collections.$inferSelect & {
  recipeCount: number;
  coverImage: CollectionCoverImage | null;
};

export type CollectionDetail = CollectionSummary & {
  recipes: Array<{
    id: string;
    title: string;
    summary: string;
    status: 'active' | 'archived' | 'trash';
    position: number;
  }>;
  availableImages: CollectionCoverImage[];
};

export class CollectionNotFoundError extends Error {}
export class CollectionConflictError extends Error {}
export class CollectionValidationError extends Error {}

function coverImageMap(coverImageIds: Array<string | null>): Map<string, CollectionCoverImage> {
  const ids = [...new Set(coverImageIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  return new Map(
    getDatabase()
      .select({
        id: recipeImages.id,
        recipeId: recipeImages.recipeId,
        altText: recipeImages.altText,
        width: recipeImages.width,
        height: recipeImages.height,
      })
      .from(recipeImages)
      .where(inArray(recipeImages.id, ids))
      .all()
      .map((image) => [image.id, image]),
  );
}

function summaries(rows: Array<typeof collections.$inferSelect>): CollectionSummary[] {
  const db = getDatabase();
  const counts = new Map<string, number>();
  db.select({ collectionId: collectionRecipes.collectionId })
    .from(collectionRecipes)
    .all()
    .forEach(({ collectionId }) => counts.set(collectionId, (counts.get(collectionId) ?? 0) + 1));
  const covers = coverImageMap(rows.map((collection) => collection.coverImageId));
  return rows.map((collection) => ({
    ...collection,
    recipeCount: counts.get(collection.id) ?? 0,
    coverImage: collection.coverImageId ? (covers.get(collection.coverImageId) ?? null) : null,
  }));
}

function collectionOrThrow(collectionId: string): typeof collections.$inferSelect {
  const collection = getDatabase()
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .get();
  if (!collection) throw new CollectionNotFoundError('That collection no longer exists.');
  return collection;
}

function assertNewName(collectionId: string | null, name: string): void {
  const current = getDatabase().select().from(collections).where(eq(collections.name, name)).get();
  if (current && current.id !== collectionId) {
    throw new CollectionConflictError('A collection with that name already exists.');
  }
}

function assertCoverBelongsToCollection(collectionId: string, coverImageId: string): void {
  const image = getDatabase()
    .select({ recipeId: recipeImages.recipeId })
    .from(recipeImages)
    .where(eq(recipeImages.id, coverImageId))
    .get();
  if (!image) {
    throw new CollectionValidationError('Choose a saved recipe photo for the collection cover.');
  }
  const membership = getDatabase()
    .select({ recipeId: collectionRecipes.recipeId })
    .from(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.recipeId, image.recipeId),
      ),
    )
    .get();
  if (!membership) {
    throw new CollectionValidationError(
      'Choose a cover photo from a recipe already saved in this collection.',
    );
  }
}

export function listCollections(): CollectionSummary[] {
  ensureDatabase();
  return summaries(
    getDatabase()
      .select()
      .from(collections)
      .orderBy(asc(collections.position), asc(collections.name))
      .all(),
  );
}

export function getCollection(collectionId: string): CollectionDetail | null {
  ensureDatabase();
  const collection = getDatabase()
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .get();
  if (!collection) return null;
  const summary = summaries([collection])[0]!;
  const memberships = getDatabase()
    .select()
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collectionId, collectionId))
    .orderBy(asc(collectionRecipes.position))
    .all();
  const recipeIds = memberships.map((membership) => membership.recipeId);
  const recipeRows = recipeIds.length
    ? getDatabase()
        .select({
          id: recipes.id,
          title: recipes.title,
          summary: recipes.summary,
          status: recipes.status,
        })
        .from(recipes)
        .where(inArray(recipes.id, recipeIds))
        .all()
    : [];
  const images = recipeIds.length
    ? getDatabase()
        .select({
          id: recipeImages.id,
          recipeId: recipeImages.recipeId,
          altText: recipeImages.altText,
          width: recipeImages.width,
          height: recipeImages.height,
        })
        .from(recipeImages)
        .where(inArray(recipeImages.recipeId, recipeIds))
        .all()
    : [];
  return {
    ...summary,
    recipes: memberships.flatMap((membership) => {
      const recipe = recipeRows.find((row) => row.id === membership.recipeId);
      return recipe ? [{ ...recipe, position: membership.position }] : [];
    }),
    availableImages: images,
  };
}

export function listCollectionsForRecipe(recipeId: string): CollectionSummary[] {
  ensureDatabase();
  const ids = getDatabase()
    .select({ collectionId: collectionRecipes.collectionId })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.recipeId, recipeId))
    .all()
    .map((membership) => membership.collectionId);
  if (!ids.length) return [];
  const rows = getDatabase().select().from(collections).where(inArray(collections.id, ids)).all();
  return summaries(rows).sort((left, right) => left.position - right.position);
}

export function createCollection(
  input: CollectionInput,
  actorProfileId: string,
): CollectionSummary {
  ensureDatabase();
  assertNewName(null, input.name);
  if (input.coverImageId) {
    throw new CollectionValidationError('Add a recipe first, then choose one of its saved photos.');
  }
  const db = getDatabase();
  const lastPosition = db
    .select({ value: sql<number>`max(${collections.position})` })
    .from(collections)
    .get()?.value;
  const now = new Date();
  const id = randomUUID();
  db.insert(collections)
    .values({
      id,
      name: input.name,
      description: input.description,
      coverImageId: null,
      position: typeof lastPosition === 'number' ? lastPosition + 1 : 0,
      createdByProfileId: actorProfileId,
      lastEditedByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return summaries([collectionOrThrow(id)])[0]!;
}

export function updateCollection(
  collectionId: string,
  input: CollectionInput,
  actorProfileId: string,
): CollectionSummary {
  ensureDatabase();
  collectionOrThrow(collectionId);
  assertNewName(collectionId, input.name);
  if (input.coverImageId) assertCoverBelongsToCollection(collectionId, input.coverImageId);
  getDatabase()
    .update(collections)
    .set({
      name: input.name,
      description: input.description,
      coverImageId: input.coverImageId || null,
      lastEditedByProfileId: actorProfileId,
      updatedAt: new Date(),
    })
    .where(eq(collections.id, collectionId))
    .run();
  return summaries([collectionOrThrow(collectionId)])[0]!;
}

export function replaceCollectionRecipes(
  collectionId: string,
  recipeIds: string[],
  actorProfileId: string,
): CollectionDetail {
  ensureDatabase();
  const collection = collectionOrThrow(collectionId);
  const uniqueIds = [...new Set(recipeIds)];
  const db = getDatabase();
  if (uniqueIds.length) {
    const found = db
      .select({ id: recipes.id })
      .from(recipes)
      .where(inArray(recipes.id, uniqueIds))
      .all()
      .map((recipe) => recipe.id);
    if (found.length !== uniqueIds.length) {
      throw new CollectionValidationError(
        'One of those recipes no longer exists. Refresh and try again.',
      );
    }
  }
  db.transaction(() => {
    db.delete(collectionRecipes).where(eq(collectionRecipes.collectionId, collectionId)).run();
    uniqueIds.forEach((recipeId, position) => {
      db.insert(collectionRecipes)
        .values({
          collectionId,
          recipeId,
          position,
          addedByProfileId: actorProfileId,
          addedAt: new Date(),
        })
        .run();
    });
    const existingCover = collection.coverImageId
      ? db
          .select({ recipeId: recipeImages.recipeId })
          .from(recipeImages)
          .where(eq(recipeImages.id, collection.coverImageId))
          .get()
      : null;
    db.update(collections)
      .set({
        coverImageId:
          existingCover && uniqueIds.includes(existingCover.recipeId)
            ? collection.coverImageId
            : null,
        lastEditedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, collectionId))
      .run();
  });
  return getCollection(collectionId) as CollectionDetail;
}

export function reorderCollections(
  collectionIds: string[],
  actorProfileId: string,
): CollectionSummary[] {
  ensureDatabase();
  const uniqueIds = [...new Set(collectionIds)];
  const currentIds = getDatabase()
    .select({ id: collections.id })
    .from(collections)
    .all()
    .map((collection) => collection.id);
  if (
    uniqueIds.length !== currentIds.length ||
    uniqueIds.some((collectionId) => !currentIds.includes(collectionId))
  ) {
    throw new CollectionValidationError('Refresh the collection list before changing its order.');
  }
  getDatabase().transaction(() => {
    uniqueIds.forEach((collectionId, position) => {
      getDatabase()
        .update(collections)
        .set({ position, lastEditedByProfileId: actorProfileId, updatedAt: new Date() })
        .where(eq(collections.id, collectionId))
        .run();
    });
  });
  return listCollections();
}

export function deleteCollection(collectionId: string): void {
  ensureDatabase();
  collectionOrThrow(collectionId);
  getDatabase().delete(collections).where(eq(collections.id, collectionId)).run();
}
