import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import {
  collectionRecipes,
  cookSessions,
  profiles,
  recipeFavorites,
  recipeEquipment,
  recipeIngredientGroups,
  recipeIngredients,
  recipeImages,
  recipeInstructionSections,
  recipeRevisions,
  recipeProfilePreferences,
  recipeSteps,
  recipeTags,
  recipes,
  tags,
} from '@/lib/db/schema';
import {
  recipeInputSchema,
  type RecipeInput,
  type RecipeLibraryQuery,
  type RecipePayload,
  type RecipePreferenceInput,
} from '@/lib/domain/recipe';
import type { TagInput } from '@/lib/domain/tag';

export type RecipeRecord = typeof recipes.$inferSelect;
export type RecipeListItem = Pick<
  RecipeRecord,
  | 'id'
  | 'title'
  | 'summary'
  | 'status'
  | 'servings'
  | 'prepMinutes'
  | 'cookMinutes'
  | 'restMinutes'
  | 'difficulty'
  | 'cuisine'
  | 'category'
  | 'currentRevision'
  | 'updatedAt'
> & {
  tags: string[];
  createdByName: string;
  isFavorite: boolean;
  personalRating: number | null;
  lastCookedAt: Date | null;
};

export type RecipeLibraryResult = {
  recipes: RecipeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PortableRecipeExportRecord = {
  recipe: RecipeDetail;
  images: Array<{ id: string; storageKey: string; altText: string }>;
};

export type TagRecord = typeof tags.$inferSelect & { usageCount: number };

export type RecipeDetail = RecipeRecord & {
  tags: string[];
  equipment: Array<{ id: string; name: string }>;
  ingredientGroups: Array<{
    id: string;
    name: string;
    ingredients: Array<{
      id: string;
      quantity: number | null;
      unit: string;
      item: string;
      note: string;
    }>;
  }>;
  instructionSections: Array<{
    id: string;
    title: string;
    steps: Array<{ id: string; body: string }>;
  }>;
  revisions: Array<{
    revision: number;
    editedByProfileId: string;
    editedByName: string;
    createdAt: Date;
  }>;
  createdByName: string;
  lastEditedByName: string;
  images: Array<{
    id: string;
    altText: string;
    width: number;
    height: number;
    createdAt: Date;
  }>;
  personalPreference: {
    rating: number | null;
    note: string;
    updatedAt: Date | null;
  } | null;
};

export class RecipeNotFoundError extends Error {}
export class RecipeConflictError extends Error {}
export class RecipeRevisionNotFoundError extends Error {}
export class TagNotFoundError extends Error {}
export class TagConflictError extends Error {}

function readDetail(recipe: RecipeRecord, activeProfileId: string | null = null): RecipeDetail {
  const db = getDatabase();
  const tags = db
    .select({ tag: recipeTags.tag })
    .from(recipeTags)
    .where(eq(recipeTags.recipeId, recipe.id))
    .orderBy(asc(recipeTags.tag))
    .all()
    .map((row) => row.tag);
  const groups = db
    .select()
    .from(recipeIngredientGroups)
    .where(eq(recipeIngredientGroups.recipeId, recipe.id))
    .orderBy(asc(recipeIngredientGroups.position))
    .all();
  const ingredients = db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipe.id))
    .orderBy(asc(recipeIngredients.position))
    .all();
  const sections = db
    .select()
    .from(recipeInstructionSections)
    .where(eq(recipeInstructionSections.recipeId, recipe.id))
    .orderBy(asc(recipeInstructionSections.position))
    .all();
  const steps = db
    .select()
    .from(recipeSteps)
    .where(eq(recipeSteps.recipeId, recipe.id))
    .orderBy(asc(recipeSteps.position))
    .all();
  const revisions = db
    .select({
      revision: recipeRevisions.revision,
      editedByProfileId: recipeRevisions.editedByProfileId,
      createdAt: recipeRevisions.createdAt,
    })
    .from(recipeRevisions)
    .where(eq(recipeRevisions.recipeId, recipe.id))
    .orderBy(desc(recipeRevisions.revision))
    .all();
  const attributionRows = db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(
      inArray(profiles.id, [
        ...new Set([
          recipe.createdByProfileId,
          recipe.lastEditedByProfileId,
          ...revisions.map((row) => row.editedByProfileId),
        ]),
      ]),
    )
    .all();
  const nameFor = (profileId: string) =>
    attributionRows.find((profile) => profile.id === profileId)?.displayName ?? 'Household member';
  const images = db
    .select({
      id: recipeImages.id,
      altText: recipeImages.altText,
      width: recipeImages.width,
      height: recipeImages.height,
      createdAt: recipeImages.createdAt,
    })
    .from(recipeImages)
    .where(eq(recipeImages.recipeId, recipe.id))
    .orderBy(desc(recipeImages.createdAt))
    .all();
  const equipment = db
    .select({ id: recipeEquipment.id, name: recipeEquipment.name })
    .from(recipeEquipment)
    .where(eq(recipeEquipment.recipeId, recipe.id))
    .orderBy(asc(recipeEquipment.position))
    .all();
  const preference = activeProfileId
    ? db
        .select({
          rating: recipeProfilePreferences.rating,
          note: recipeProfilePreferences.note,
          updatedAt: recipeProfilePreferences.updatedAt,
        })
        .from(recipeProfilePreferences)
        .where(
          and(
            eq(recipeProfilePreferences.recipeId, recipe.id),
            eq(recipeProfilePreferences.profileId, activeProfileId),
          ),
        )
        .get()
    : null;

  return {
    ...recipe,
    tags,
    equipment,
    ingredientGroups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      ingredients: ingredients
        .filter((ingredient) => ingredient.groupId === group.id)
        .map(({ id, quantity, unit, item, note }) => ({ id, quantity, unit, item, note })),
    })),
    instructionSections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      steps: steps
        .filter((step) => step.sectionId === section.id)
        .map(({ id, body }) => ({ id, body })),
    })),
    revisions: revisions.map((revision) => ({
      ...revision,
      editedByName: nameFor(revision.editedByProfileId),
    })),
    createdByName: nameFor(recipe.createdByProfileId),
    lastEditedByName: nameFor(recipe.lastEditedByProfileId),
    images,
    personalPreference: activeProfileId
      ? {
          rating: preference?.rating ?? null,
          note: preference?.note ?? '',
          updatedAt: preference?.updatedAt ?? null,
        }
      : null,
  };
}

function searchExpression(query: string): string | null {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length
    ? tokens.map((token) => `"${token.replace(/"/g, '')}"*`).join(' AND ')
    : null;
}

function indexRecipe(recipeId: string, payload: RecipePayload): void {
  const ingredients = payload.ingredientGroups
    .flatMap((group) => group.ingredients)
    .map((ingredient) =>
      [ingredient.quantity, ingredient.unit, ingredient.item, ingredient.note]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');
  const db = getDatabase();
  db.run(sql`DELETE FROM recipe_search WHERE recipe_id = ${recipeId}`);
  db.run(sql`INSERT INTO recipe_search (recipe_id, title, summary, ingredients, tags)
    VALUES (${recipeId}, ${payload.title}, ${payload.summary}, ${ingredients}, ${[
      ...payload.tags,
      payload.category,
      payload.cuisine,
    ].join(' ')})`);
}

function createGraph(recipeId: string, payload: RecipePayload): void {
  const db = getDatabase();
  ensureTags(payload.tags);
  payload.tags.forEach((tag) => db.insert(recipeTags).values({ recipeId, tag }).run());
  payload.ingredientGroups.forEach((group, groupPosition) => {
    const groupId = randomUUID();
    db.insert(recipeIngredientGroups)
      .values({ id: groupId, recipeId, position: groupPosition, name: group.name })
      .run();
    group.ingredients.forEach((ingredient, position) => {
      db.insert(recipeIngredients)
        .values({
          id: randomUUID(),
          recipeId,
          groupId,
          position,
          quantity: ingredient.quantity === '' ? null : ingredient.quantity,
          unit: ingredient.unit,
          item: ingredient.item,
          note: ingredient.note,
        })
        .run();
    });
  });
  payload.instructionSections.forEach((section, sectionPosition) => {
    const sectionId = randomUUID();
    db.insert(recipeInstructionSections)
      .values({ id: sectionId, recipeId, position: sectionPosition, title: section.title })
      .run();
    section.steps.forEach((body, position) => {
      db.insert(recipeSteps)
        .values({ id: randomUUID(), recipeId, sectionId, position, body })
        .run();
    });
  });
  payload.equipment.forEach((name, position) => {
    db.insert(recipeEquipment).values({ id: randomUUID(), recipeId, position, name }).run();
  });
}

function ensureTags(tagNames: string[]): void {
  const db = getDatabase();
  const now = new Date();
  tagNames.forEach((name) => {
    db.insert(tags)
      .values({ id: randomUUID(), name, color: null, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  });
}

function noRowsCondition() {
  return sql`0 = 1`;
}

function idsForTag(tag: string): string[] {
  return getDatabase()
    .select({ recipeId: recipeTags.recipeId })
    .from(recipeTags)
    .where(eq(recipeTags.tag, tag))
    .all()
    .map((row) => row.recipeId);
}

function idsForCollection(collectionId: string): string[] {
  return getDatabase()
    .select({ recipeId: collectionRecipes.recipeId })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collectionId, collectionId))
    .all()
    .map((row) => row.recipeId);
}

function idsForProfileRecipeRows(
  profileId: string,
  table: typeof recipeFavorites | typeof cookSessions,
): string[] {
  if (table === recipeFavorites) {
    return getDatabase()
      .select({ recipeId: recipeFavorites.recipeId })
      .from(recipeFavorites)
      .where(eq(recipeFavorites.profileId, profileId))
      .all()
      .map((row) => row.recipeId);
  }
  return getDatabase()
    .select({ recipeId: cookSessions.recipeId })
    .from(cookSessions)
    .where(and(eq(cookSessions.profileId, profileId), sql`${cookSessions.completedAt} IS NOT NULL`))
    .all()
    .map((row) => row.recipeId);
}

export function listRecipeTags(): string[] {
  ensureDatabase();
  return getDatabase()
    .select({ tag: tags.name })
    .from(tags)
    .orderBy(asc(tags.name))
    .all()
    .map((row) => row.tag);
}

export function listTags(): TagRecord[] {
  ensureDatabase();
  const db = getDatabase();
  const tagRows = db.select().from(tags).orderBy(asc(tags.name)).all();
  const usageRows = db.select({ tag: recipeTags.tag }).from(recipeTags).all();
  const usages = new Map<string, number>();
  usageRows.forEach((row) => usages.set(row.tag, (usages.get(row.tag) ?? 0) + 1));
  return tagRows.map((tag) => ({ ...tag, usageCount: usages.get(tag.name) ?? 0 }));
}

function getTagOrThrow(name: string) {
  const tag = getDatabase().select().from(tags).where(eq(tags.name, name)).get();
  if (!tag) throw new TagNotFoundError('That household tag no longer exists.');
  return tag;
}

function refreshTagSearch(recipeIds: string[]): void {
  recipeIds.forEach((recipeId) => {
    const recipe = getRecipe(recipeId);
    if (recipe) indexRecipe(recipeId, payloadFromRecipe(recipe));
  });
}

function taggedRecipeIds(tagName: string): string[] {
  return getDatabase()
    .select({ recipeId: recipeTags.recipeId })
    .from(recipeTags)
    .where(eq(recipeTags.tag, tagName))
    .all()
    .map((row) => row.recipeId);
}

export function createTag(input: TagInput): TagRecord {
  ensureDatabase();
  const db = getDatabase();
  if (db.select({ id: tags.id }).from(tags).where(eq(tags.name, input.name)).get()) {
    throw new TagConflictError(
      'That tag already exists. Choose another name or edit the existing tag.',
    );
  }
  const now = new Date();
  db.insert(tags)
    .values({
      id: randomUUID(),
      name: input.name,
      color: input.color || null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { ...getTagOrThrow(input.name), usageCount: 0 };
}

export function updateTag(sourceName: string, input: TagInput): TagRecord {
  ensureDatabase();
  const db = getDatabase();
  getTagOrThrow(sourceName);
  if (
    sourceName !== input.name &&
    db.select({ id: tags.id }).from(tags).where(eq(tags.name, input.name)).get()
  ) {
    throw new TagConflictError(
      'That target tag already exists. Use merge to combine the two tags.',
    );
  }
  const recipeIds = sourceName === input.name ? [] : taggedRecipeIds(sourceName);
  db.transaction(() => {
    if (sourceName !== input.name) {
      db.update(recipeTags).set({ tag: input.name }).where(eq(recipeTags.tag, sourceName)).run();
    }
    db.update(tags)
      .set({ name: input.name, color: input.color || null, updatedAt: new Date() })
      .where(eq(tags.name, sourceName))
      .run();
  });
  refreshTagSearch(recipeIds);
  return { ...getTagOrThrow(input.name), usageCount: taggedRecipeIds(input.name).length };
}

export function mergeTag(sourceName: string, input: TagInput): TagRecord {
  ensureDatabase();
  const db = getDatabase();
  getTagOrThrow(sourceName);
  if (sourceName === input.name) return updateTag(sourceName, input);
  const recipeIds = taggedRecipeIds(sourceName);
  db.transaction(() => {
    ensureTags([input.name]);
    if (input.color) {
      db.update(tags)
        .set({ color: input.color, updatedAt: new Date() })
        .where(eq(tags.name, input.name))
        .run();
    }
    recipeIds.forEach((recipeId) => {
      db.insert(recipeTags).values({ recipeId, tag: input.name }).onConflictDoNothing().run();
    });
    db.delete(recipeTags).where(eq(recipeTags.tag, sourceName)).run();
    db.delete(tags).where(eq(tags.name, sourceName)).run();
  });
  refreshTagSearch(recipeIds);
  return { ...getTagOrThrow(input.name), usageCount: taggedRecipeIds(input.name).length };
}

export function deleteTag(tagName: string): void {
  ensureDatabase();
  const db = getDatabase();
  getTagOrThrow(tagName);
  const recipeIds = taggedRecipeIds(tagName);
  db.transaction(() => {
    db.delete(recipeTags).where(eq(recipeTags.tag, tagName)).run();
    db.delete(tags).where(eq(tags.name, tagName)).run();
  });
  refreshTagSearch(recipeIds);
}

export function listRecipeLibrary(
  query: RecipeLibraryQuery,
  activeProfileId: string | null,
  pageSize = 24,
): RecipeLibraryResult {
  ensureDatabase();
  const db = getDatabase();
  const expression = searchExpression(query.q);
  const matchingIds = expression
    ? db
        .all<{ recipeId: string }>(
          sql`SELECT recipe_id as recipeId FROM recipe_search WHERE recipe_search MATCH ${expression} ORDER BY rank`,
        )
        .map((row) => row.recipeId)
    : [];
  const conditions = [];
  if (expression)
    conditions.push(matchingIds.length ? inArray(recipes.id, matchingIds) : noRowsCondition());
  if (query.creator) conditions.push(eq(recipes.createdByProfileId, query.creator));
  if (query.tag) {
    const taggedIds = idsForTag(query.tag);
    conditions.push(taggedIds.length ? inArray(recipes.id, taggedIds) : noRowsCondition());
  }
  if (query.collection) {
    const collectionIds = idsForCollection(query.collection);
    conditions.push(collectionIds.length ? inArray(recipes.id, collectionIds) : noRowsCondition());
  }
  if (query.category) conditions.push(eq(recipes.category, query.category));
  if (query.cuisine) conditions.push(eq(recipes.cuisine, query.cuisine));
  if (query.maxTotalMinutes)
    conditions.push(
      lte(
        sql<number>`${recipes.prepMinutes} + ${recipes.cookMinutes} + ${recipes.restMinutes}`,
        query.maxTotalMinutes,
      ),
    );
  if (query.status !== 'all') conditions.push(eq(recipes.status, query.status));
  if (query.favorite) {
    const favoriteIds = activeProfileId
      ? idsForProfileRecipeRows(activeProfileId, recipeFavorites)
      : [];
    conditions.push(favoriteIds.length ? inArray(recipes.id, favoriteIds) : noRowsCondition());
  }
  if (query.cooked) {
    const cookedIds = activeProfileId ? idsForProfileRecipeRows(activeProfileId, cookSessions) : [];
    conditions.push(cookedIds.length ? inArray(recipes.id, cookedIds) : noRowsCondition());
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const total =
    db
      .select({ count: sql<number>`count(*)` })
      .from(recipes)
      .where(where)
      .get()?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.page, totalPages);
  const lastCookedOrder = activeProfileId
    ? sql`COALESCE((SELECT MAX(completed_at) FROM cook_sessions WHERE recipe_id = ${recipes.id} AND profile_id = ${activeProfileId}), 0) DESC`
    : desc(recipes.updatedAt);
  const highestRatedOrder = activeProfileId
    ? sql`COALESCE((SELECT rating FROM recipe_profile_preferences WHERE recipe_id = ${recipes.id} AND profile_id = ${activeProfileId}), 0) DESC`
    : desc(recipes.updatedAt);
  const order = {
    'recently-added': [desc(recipes.createdAt), desc(recipes.id)],
    'recently-updated': [desc(recipes.updatedAt), desc(recipes.id)],
    alphabetical: [asc(recipes.title), desc(recipes.id)],
    'most-recently-cooked': [lastCookedOrder, desc(recipes.updatedAt)],
    'highest-rated': [highestRatedOrder, desc(recipes.updatedAt), desc(recipes.id)],
    'shortest-time': [
      asc(sql<number>`${recipes.prepMinutes} + ${recipes.cookMinutes} + ${recipes.restMinutes}`),
      asc(recipes.title),
    ],
  }[query.sort];
  const orderedRows = db
    .select()
    .from(recipes)
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const tagRows = orderedRows.length
    ? db
        .select()
        .from(recipeTags)
        .where(
          inArray(
            recipeTags.recipeId,
            orderedRows.map((recipe) => recipe.id),
          ),
        )
        .all()
    : [];
  const profileRows = orderedRows.length
    ? db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(
          inArray(
            profiles.id,
            orderedRows.map((recipe) => recipe.createdByProfileId),
          ),
        )
        .all()
    : [];
  const favoriteIds = activeProfileId
    ? new Set(idsForProfileRecipeRows(activeProfileId, recipeFavorites))
    : new Set<string>();
  const ratingsByRecipe = new Map<string, number | null>();
  if (activeProfileId && orderedRows.length) {
    db.select({
      recipeId: recipeProfilePreferences.recipeId,
      rating: recipeProfilePreferences.rating,
    })
      .from(recipeProfilePreferences)
      .where(
        and(
          eq(recipeProfilePreferences.profileId, activeProfileId),
          inArray(
            recipeProfilePreferences.recipeId,
            orderedRows.map((recipe) => recipe.id),
          ),
        ),
      )
      .all()
      .forEach((row) => ratingsByRecipe.set(row.recipeId, row.rating));
  }
  const cookedRows =
    activeProfileId && orderedRows.length
      ? db
          .select({ recipeId: cookSessions.recipeId, completedAt: cookSessions.completedAt })
          .from(cookSessions)
          .where(
            and(
              eq(cookSessions.profileId, activeProfileId),
              inArray(
                cookSessions.recipeId,
                orderedRows.map((recipe) => recipe.id),
              ),
              sql`${cookSessions.completedAt} IS NOT NULL`,
            ),
          )
          .all()
      : [];
  const lastCookedByRecipe = new Map<string, Date>();
  cookedRows.forEach((row) => {
    if (
      row.completedAt &&
      (!lastCookedByRecipe.get(row.recipeId) ||
        row.completedAt > lastCookedByRecipe.get(row.recipeId)!)
    )
      lastCookedByRecipe.set(row.recipeId, row.completedAt);
  });
  return {
    recipes: orderedRows.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      summary: recipe.summary,
      status: recipe.status,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      restMinutes: recipe.restMinutes,
      difficulty: recipe.difficulty,
      cuisine: recipe.cuisine,
      category: recipe.category,
      currentRevision: recipe.currentRevision,
      updatedAt: recipe.updatedAt,
      tags: tagRows.filter((tag) => tag.recipeId === recipe.id).map((tag) => tag.tag),
      createdByName:
        profileRows.find((profile) => profile.id === recipe.createdByProfileId)?.displayName ??
        'Household member',
      isFavorite: favoriteIds.has(recipe.id),
      personalRating: ratingsByRecipe.get(recipe.id) ?? null,
      lastCookedAt: lastCookedByRecipe.get(recipe.id) ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function listRecipes(query = ''): RecipeListItem[] {
  const results = listRecipeLibrary(
    {
      q: query,
      status: 'active',
      sort: 'recently-updated',
      page: 1,
    },
    null,
    10_000,
  );
  return results.recipes;
}

export function listRecipesForPortableExport(): PortableRecipeExportRecord[] {
  ensureDatabase();
  const db = getDatabase();
  return db
    .select()
    .from(recipes)
    .orderBy(asc(recipes.id))
    .all()
    .map((recipe) => ({
      recipe: readDetail(recipe),
      images: db
        .select({
          id: recipeImages.id,
          storageKey: recipeImages.storageKey,
          altText: recipeImages.altText,
        })
        .from(recipeImages)
        .where(eq(recipeImages.recipeId, recipe.id))
        .orderBy(asc(recipeImages.createdAt), asc(recipeImages.id))
        .all(),
    }));
}

export function getRecipe(
  recipeId: string,
  activeProfileId: string | null = null,
): RecipeDetail | null {
  ensureDatabase();
  const recipe = getDatabase().select().from(recipes).where(eq(recipes.id, recipeId)).get();
  return recipe ? readDetail(recipe, activeProfileId) : null;
}

export function createRecipe(input: RecipeInput, actorProfileId: string): RecipeDetail {
  ensureDatabase();
  const payload = recipeInputSchema.parse(input);
  const recipeId = randomUUID();
  const now = new Date();
  const db = getDatabase();
  db.transaction(() => {
    db.insert(recipes)
      .values({
        id: recipeId,
        title: payload.title,
        summary: payload.summary,
        status: payload.status,
        servings: payload.servings,
        prepMinutes: payload.prepMinutes,
        cookMinutes: payload.cookMinutes,
        restMinutes: payload.restMinutes,
        difficulty: payload.difficulty,
        cuisine: payload.cuisine,
        category: payload.category,
        tips: payload.tips,
        sharedNotes: payload.sharedNotes,
        sourceName: payload.sourceName || null,
        sourceUrl: payload.sourceUrl || null,
        originalAuthor: payload.originalAuthor || null,
        cookingMethod: payload.cookingMethod,
        nutritionCalories: payload.nutritionCalories === '' ? null : payload.nutritionCalories,
        nutritionProteinGrams:
          payload.nutritionProteinGrams === '' ? null : payload.nutritionProteinGrams,
        nutritionCarbohydrateGrams:
          payload.nutritionCarbohydrateGrams === '' ? null : payload.nutritionCarbohydrateGrams,
        nutritionFatGrams: payload.nutritionFatGrams === '' ? null : payload.nutritionFatGrams,
        nutritionFiberGrams:
          payload.nutritionFiberGrams === '' ? null : payload.nutritionFiberGrams,
        createdByProfileId: actorProfileId,
        lastEditedByProfileId: actorProfileId,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    createGraph(recipeId, payload);
    db.insert(recipeRevisions)
      .values({
        recipeId,
        revision: 1,
        snapshot: JSON.stringify(payload),
        editedByProfileId: actorProfileId,
        createdAt: now,
      })
      .run();
    indexRecipe(recipeId, payload);
  });
  return getRecipe(recipeId) as RecipeDetail;
}

export function updateRecipe(
  recipeId: string,
  input: RecipeInput,
  actorProfileId: string,
  expectedRevision: number,
): RecipeDetail {
  ensureDatabase();
  const payload = recipeInputSchema.parse(input);
  const current = getDatabase().select().from(recipes).where(eq(recipes.id, recipeId)).get();
  if (!current) throw new RecipeNotFoundError('That recipe no longer exists.');
  if (current.currentRevision !== expectedRevision)
    throw new RecipeConflictError(
      'This recipe changed in another tab. Refresh the card before saving your revision.',
    );
  const revision = current.currentRevision + 1;
  const now = new Date();
  const db = getDatabase();
  db.transaction(() => {
    db.update(recipes)
      .set({
        title: payload.title,
        summary: payload.summary,
        status: payload.status,
        servings: payload.servings,
        prepMinutes: payload.prepMinutes,
        cookMinutes: payload.cookMinutes,
        restMinutes: payload.restMinutes,
        difficulty: payload.difficulty,
        cuisine: payload.cuisine,
        category: payload.category,
        tips: payload.tips,
        sharedNotes: payload.sharedNotes,
        sourceName: payload.sourceName || null,
        sourceUrl: payload.sourceUrl || null,
        originalAuthor: payload.originalAuthor || null,
        cookingMethod: payload.cookingMethod,
        nutritionCalories: payload.nutritionCalories === '' ? null : payload.nutritionCalories,
        nutritionProteinGrams:
          payload.nutritionProteinGrams === '' ? null : payload.nutritionProteinGrams,
        nutritionCarbohydrateGrams:
          payload.nutritionCarbohydrateGrams === '' ? null : payload.nutritionCarbohydrateGrams,
        nutritionFatGrams: payload.nutritionFatGrams === '' ? null : payload.nutritionFatGrams,
        nutritionFiberGrams:
          payload.nutritionFiberGrams === '' ? null : payload.nutritionFiberGrams,
        lastEditedByProfileId: actorProfileId,
        currentRevision: revision,
        updatedAt: now,
      })
      .where(eq(recipes.id, recipeId))
      .run();
    db.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId)).run();
    db.delete(recipeIngredientGroups).where(eq(recipeIngredientGroups.recipeId, recipeId)).run();
    db.delete(recipeInstructionSections)
      .where(eq(recipeInstructionSections.recipeId, recipeId))
      .run();
    db.delete(recipeEquipment).where(eq(recipeEquipment.recipeId, recipeId)).run();
    createGraph(recipeId, payload);
    db.insert(recipeRevisions)
      .values({
        recipeId,
        revision,
        snapshot: JSON.stringify(payload),
        editedByProfileId: actorProfileId,
        createdAt: now,
      })
      .run();
    indexRecipe(recipeId, payload);
  });
  return getRecipe(recipeId) as RecipeDetail;
}

function payloadFromRecipe(recipe: RecipeDetail): RecipePayload {
  return {
    title: recipe.title,
    summary: recipe.summary,
    status: recipe.status,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes,
    difficulty: recipe.difficulty,
    cuisine: recipe.cuisine,
    category: recipe.category,
    tips: recipe.tips,
    sharedNotes: recipe.sharedNotes,
    sourceName: recipe.sourceName || '',
    sourceUrl: recipe.sourceUrl || '',
    originalAuthor: recipe.originalAuthor || '',
    cookingMethod: recipe.cookingMethod,
    equipment: recipe.equipment.map((item) => item.name),
    nutritionCalories: recipe.nutritionCalories ?? '',
    nutritionProteinGrams: recipe.nutritionProteinGrams ?? '',
    nutritionCarbohydrateGrams: recipe.nutritionCarbohydrateGrams ?? '',
    nutritionFatGrams: recipe.nutritionFatGrams ?? '',
    nutritionFiberGrams: recipe.nutritionFiberGrams ?? '',
    tags: recipe.tags,
    ingredientGroups: recipe.ingredientGroups.map((group) => ({
      name: group.name,
      ingredients: group.ingredients.map((ingredient) => ({
        quantity: ingredient.quantity ?? '',
        unit: ingredient.unit,
        item: ingredient.item,
        note: ingredient.note,
      })),
    })),
    instructionSections: recipe.instructionSections.map((section) => ({
      title: section.title,
      steps: section.steps.map((step) => step.body),
    })),
  };
}

export function duplicateRecipe(recipeId: string, actorProfileId: string): RecipeDetail {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  return createRecipe(
    {
      ...payloadFromRecipe(recipe),
      title: `Copy of ${recipe.title}`.slice(0, 160),
      status: 'active',
    },
    actorProfileId,
  );
}

export function updateRecipeStatus(
  recipeId: string,
  status: RecipePayload['status'],
  actorProfileId: string,
  expectedRevision: number,
): RecipeDetail {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  if (recipe.currentRevision !== expectedRevision)
    throw new RecipeConflictError(
      'This recipe changed in another tab. Refresh the card before changing its lifecycle.',
    );
  return updateRecipe(
    recipeId,
    { ...payloadFromRecipe(recipe), status },
    actorProfileId,
    expectedRevision,
  );
}

export function restoreRecipeRevision(
  recipeId: string,
  sourceRevision: number,
  actorProfileId: string,
  expectedRevision: number,
): RecipeDetail {
  ensureDatabase();
  const snapshot = getDatabase()
    .select({ snapshot: recipeRevisions.snapshot })
    .from(recipeRevisions)
    .where(
      and(eq(recipeRevisions.recipeId, recipeId), eq(recipeRevisions.revision, sourceRevision)),
    )
    .get();
  if (!snapshot)
    throw new RecipeRevisionNotFoundError('That saved recipe version no longer exists.');
  let parsedSnapshot: unknown;
  try {
    parsedSnapshot = JSON.parse(snapshot.snapshot);
  } catch {
    throw new RecipeRevisionNotFoundError('That saved recipe version cannot be restored safely.');
  }
  const payload = recipeInputSchema.safeParse(parsedSnapshot);
  if (!payload.success)
    throw new RecipeRevisionNotFoundError('That saved recipe version cannot be restored safely.');
  return updateRecipe(recipeId, payload.data, actorProfileId, expectedRevision);
}

export function setRecipePreference(
  recipeId: string,
  profileId: string,
  input: RecipePreferenceInput,
): NonNullable<RecipeDetail['personalPreference']> {
  ensureDatabase();
  const recipe = getDatabase()
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .get();
  if (!recipe) throw new RecipeNotFoundError('That recipe no longer exists.');
  const preference = input;
  const db = getDatabase();
  if (preference.rating === null && !preference.note) {
    db.delete(recipeProfilePreferences)
      .where(
        and(
          eq(recipeProfilePreferences.recipeId, recipeId),
          eq(recipeProfilePreferences.profileId, profileId),
        ),
      )
      .run();
    return { rating: null, note: '', updatedAt: null };
  }
  const updatedAt = new Date();
  db.insert(recipeProfilePreferences)
    .values({ recipeId, profileId, rating: preference.rating, note: preference.note, updatedAt })
    .onConflictDoUpdate({
      target: [recipeProfilePreferences.profileId, recipeProfilePreferences.recipeId],
      set: { rating: preference.rating, note: preference.note, updatedAt },
    })
    .run();
  return { rating: preference.rating, note: preference.note, updatedAt };
}

function markdownInline(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\s+/g, ' ').trim();
}

function markdownBlock(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

export function recipeAsMarkdown(recipe: RecipeDetail): string {
  const lines = [`# ${markdownInline(recipe.title)}`];
  if (recipe.summary) lines.push('', markdownBlock(recipe.summary));
  lines.push('', '## Details');
  lines.push(`- Serves: ${markdownInline(recipe.servings)}`);
  lines.push(`- Prep: ${recipe.prepMinutes} min`);
  lines.push(`- Cook: ${recipe.cookMinutes} min`);
  if (recipe.restMinutes) lines.push(`- Rest: ${recipe.restMinutes} min`);
  if (recipe.cookingMethod) lines.push(`- Cooking method: ${markdownInline(recipe.cookingMethod)}`);
  if (recipe.category) lines.push(`- Category: ${markdownInline(recipe.category)}`);
  if (recipe.cuisine) lines.push(`- Cuisine: ${markdownInline(recipe.cuisine)}`);
  if (recipe.difficulty) lines.push(`- Difficulty: ${markdownInline(recipe.difficulty)}`);
  if (recipe.tags.length) lines.push(`- Tags: ${recipe.tags.map(markdownInline).join(', ')}`);
  if (recipe.equipment.length) {
    lines.push(
      '',
      '## Equipment',
      ...recipe.equipment.map((item) => `- ${markdownInline(item.name)}`),
    );
  }
  const nutrition = [
    recipe.nutritionCalories === null ? null : `Calories: ${recipe.nutritionCalories} kcal`,
    recipe.nutritionProteinGrams === null ? null : `Protein: ${recipe.nutritionProteinGrams} g`,
    recipe.nutritionCarbohydrateGrams === null
      ? null
      : `Carbohydrates: ${recipe.nutritionCarbohydrateGrams} g`,
    recipe.nutritionFatGrams === null ? null : `Fat: ${recipe.nutritionFatGrams} g`,
    recipe.nutritionFiberGrams === null ? null : `Fiber: ${recipe.nutritionFiberGrams} g`,
  ].filter((item): item is string => Boolean(item));
  if (nutrition.length)
    lines.push('', '## Nutrition (as entered)', ...nutrition.map((item) => `- ${item}`));
  lines.push('', '## Ingredients');
  recipe.ingredientGroups.forEach((group) => {
    if (group.name) lines.push('', `### ${markdownInline(group.name)}`);
    group.ingredients.forEach((ingredient) => {
      const quantity = ingredient.quantity === null ? '' : `${ingredient.quantity} `;
      const unit = ingredient.unit ? `${markdownInline(ingredient.unit)} ` : '';
      const note = ingredient.note ? ` (${markdownInline(ingredient.note)})` : '';
      lines.push(`- ${quantity}${unit}${markdownInline(ingredient.item)}${note}`.trimEnd());
    });
  });
  lines.push('', '## Method');
  let stepNumber = 1;
  recipe.instructionSections.forEach((section) => {
    if (section.title) lines.push('', `### ${markdownInline(section.title)}`);
    section.steps.forEach((step) => {
      lines.push(`${stepNumber}. ${markdownBlock(step.body)}`);
      stepNumber += 1;
    });
  });
  if (recipe.sourceName || recipe.sourceUrl || recipe.originalAuthor) {
    lines.push('', '## Source');
    if (recipe.sourceName) lines.push(`- Source: ${markdownInline(recipe.sourceName)}`);
    if (recipe.originalAuthor)
      lines.push(`- Original author: ${markdownInline(recipe.originalAuthor)}`);
    if (recipe.sourceUrl) lines.push(`- URL: ${recipe.sourceUrl}`);
  }
  if (recipe.tips) lines.push('', '## Kitchen tips', markdownBlock(recipe.tips));
  if (recipe.sharedNotes) lines.push('', '## Shared notes', markdownBlock(recipe.sharedNotes));
  return `${lines.join('\n')}\n`;
}
