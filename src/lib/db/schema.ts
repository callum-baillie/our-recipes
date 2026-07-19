import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  appName: text('app_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  color: text('color').notNull(),
  avatarUrl: text('avatar_url'),
  units: text('units', { enum: ['metric', 'imperial'] }).notNull(),
  temperatureUnit: text('temperature_unit', { enum: ['C', 'F'] }).notNull(),
  locale: text('locale').notNull(),
  timezone: text('timezone').notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  status: text('status', { enum: ['active', 'archived', 'trash'] }).notNull(),
  servings: text('servings').notNull(),
  prepMinutes: integer('prep_minutes').notNull(),
  cookMinutes: integer('cook_minutes').notNull(),
  restMinutes: integer('rest_minutes').notNull(),
  difficulty: text('difficulty').notNull(),
  cuisine: text('cuisine').notNull(),
  category: text('category').notNull(),
  tips: text('tips').notNull(),
  sharedNotes: text('shared_notes').notNull(),
  sourceName: text('source_name'),
  sourceUrl: text('source_url'),
  originalAuthor: text('original_author'),
  cookingMethod: text('cooking_method').notNull().default(''),
  nutritionCalories: real('nutrition_calories'),
  nutritionProteinGrams: real('nutrition_protein_grams'),
  nutritionCarbohydrateGrams: real('nutrition_carbohydrate_grams'),
  nutritionFatGrams: real('nutrition_fat_grams'),
  nutritionSaturatedFatGrams: real('nutrition_saturated_fat_grams'),
  nutritionFiberGrams: real('nutrition_fiber_grams'),
  nutritionSugarGrams: real('nutrition_sugar_grams'),
  nutritionSodiumMilligrams: real('nutrition_sodium_milligrams'),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  lastEditedByProfileId: text('last_edited_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  currentRevision: integer('current_revision').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const recipeTags = sqliteTable(
  'recipe_tags',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.tag] })],
);

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const recipeIngredientGroups = sqliteTable('recipe_ingredient_groups', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
});

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  groupId: text('group_id')
    .notNull()
    .references(() => recipeIngredientGroups.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  quantity: real('quantity'),
  unit: text('unit').notNull(),
  item: text('item').notNull(),
  note: text('note').notNull(),
});

export const recipeInstructionSections = sqliteTable('recipe_instruction_sections', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  title: text('title').notNull(),
});

export const recipeSteps = sqliteTable('recipe_steps', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  sectionId: text('section_id')
    .notNull()
    .references(() => recipeInstructionSections.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  body: text('body').notNull(),
});

export const recipeEquipment = sqliteTable('recipe_equipment', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
});

export const recipeRevisions = sqliteTable(
  'recipe_revisions',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    snapshot: text('snapshot').notNull(),
    editedByProfileId: text('edited_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.revision] })],
);

export const recipeImages = sqliteTable('recipe_images', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull().unique(),
  altText: text('alt_text').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  coverImageId: text('cover_image_id').references(() => recipeImages.id, { onDelete: 'set null' }),
  position: integer('position').notNull(),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  lastEditedByProfileId: text('last_edited_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const collectionRecipes = sqliteTable(
  'collection_recipes',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedByProfileId: text('added_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    addedAt: integer('added_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.recipeId] })],
);

export const importOperations = sqliteTable('import_operations', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['pdf', 'image'] }).notNull(),
  status: text('status', { enum: ['review', 'confirmed'] }).notNull(),
  sourceName: text('source_name').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mediaType: text('media_type').notNull(),
  sourceSha256: text('source_sha256').notNull(),
  extractionMethod: text('extraction_method', {
    enum: ['pdf-text', 'manual-transcription', 'local-ocr', 'openai-vision-pending'],
  }).notNull(),
  extractedText: text('extracted_text').notNull(),
  ocrProvenance: text('ocr_provenance'),
  warnings: text('warnings').notNull(),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  confirmedByProfileId: text('confirmed_by_profile_id').references(() => profiles.id),
  confirmedRecipeId: text('confirmed_recipe_id').references(() => recipes.id, {
    onDelete: 'set null',
  }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
});

export const importArtifacts = sqliteTable('import_artifacts', {
  id: text('id').primaryKey(),
  importOperationId: text('import_operation_id')
    .notNull()
    .references(() => importOperations.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  sourceName: text('source_name').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mediaType: text('media_type').notNull(),
  sourceSha256: text('source_sha256').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const aiOperationAudits = sqliteTable('ai_operation_audits', {
  id: text('id').primaryKey(),
  kind: text('kind', {
    enum: [
      'text-normalization',
      'vision-extraction',
      'image-generation',
      'nutrition-estimation',
      'recipe-improvement',
    ],
  }).notNull(),
  status: text('status', { enum: ['requested', 'succeeded', 'failed'] }).notNull(),
  sourceDigest: text('source_digest').notNull(),
  sourceLabel: text('source_label').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  profileId: text('profile_id')
    .notNull()
    .references(() => profiles.id),
  recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  importId: text('import_id').references(() => importOperations.id, { onDelete: 'set null' }),
  generatedImageId: text('generated_image_id').references(() => recipeImages.id, {
    onDelete: 'set null',
  }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const mealPlanEntries = sqliteTable('meal_plan_entries', {
  id: text('id').primaryKey(),
  plannedFor: text('planned_for').notNull(),
  meal: text('meal', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }).notNull(),
  recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  servings: integer('servings').notNull(),
  note: text('note').notNull(),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  updatedByProfileId: text('updated_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  weekStart: text('week_start').notNull(),
  weekEnd: text('week_end').notNull(),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const shoppingAisles = sqliteTable('shopping_aisles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const shoppingListItems = sqliteTable('shopping_list_items', {
  id: text('id').primaryKey(),
  listId: text('list_id')
    .notNull()
    .references(() => shoppingLists.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  quantity: real('quantity'),
  unit: text('unit').notNull(),
  item: text('item').notNull(),
  note: text('note').notNull(),
  aisleId: text('aisle_id').references(() => shoppingAisles.id, { onDelete: 'set null' }),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  sourceRecipeIds: text('source_recipe_ids').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const recipeFavorites = sqliteTable(
  'recipe_favorites',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.recipeId] })],
);

export const recipeProfilePreferences = sqliteTable(
  'recipe_profile_preferences',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    rating: integer('rating'),
    note: text('note').notNull().default(''),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.recipeId] })],
);

export const cookSessions = sqliteTable('cook_sessions', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  profileId: text('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  targetServings: integer('target_servings').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});
