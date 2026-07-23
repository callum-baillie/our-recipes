import {
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { defaultProfileGoalContext, type ProfileGoalContext } from '@/lib/domain/profile-goals';

export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  kitchenName: text('kitchen_name').notNull().default('Bòrd'),
  kitchenIcon: text('kitchen_icon').notNull().default('table'),
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
  mainGoals: text('main_goals').notNull().default(''),
  goalContext: text('goal_context', { mode: 'json' })
    .$type<ProfileGoalContext>()
    .notNull()
    .default(defaultProfileGoalContext),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const householdExperienceSettings = sqliteTable('household_experience_settings', {
  householdId: text('household_id')
    .primaryKey()
    .references(() => households.id, { onDelete: 'cascade' }),
  recipeDefaultSort: text('recipe_default_sort', {
    enum: [
      'recently-added',
      'recently-updated',
      'alphabetical',
      'most-recently-cooked',
      'shortest-time',
      'highest-rated',
    ],
  })
    .notNull()
    .default('recently-updated'),
  recipeDefaultServings: integer('recipe_default_servings').notNull().default(4),
  mealPlanWeekStartsOn: integer('meal_plan_week_starts_on').notNull().default(1),
  mealPlanDefaultDuration: integer('meal_plan_default_duration').notNull().default(7),
  mealPlanDefaultMealTypes: text('meal_plan_default_meal_types')
    .notNull()
    .default('["breakfast","lunch","dinner"]'),
  pantryDefaultView: text('pantry_default_view', {
    enum: [
      'all',
      'pantry',
      'refrigerator',
      'freezer',
      'low_stock',
      'opened',
      'unopened',
      'frozen',
      'recent',
    ],
  })
    .notNull()
    .default('all'),
  pantryDefaultSort: text('pantry_default_sort', {
    enum: ['expiry', 'name', 'quantity', 'location', 'updated', 'added'],
  })
    .notNull()
    .default('expiry'),
  pantryDefaultGroup: text('pantry_default_group', {
    enum: ['none', 'location', 'category', 'expiry'],
  })
    .notNull()
    .default('location'),
  version: integer('version').notNull().default(1),
  updatedByProfileId: text('updated_by_profile_id')
    .notNull()
    .references(() => profiles.id),
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
      'assistant-chat',
      'recipe-generation',
      'meal-plan-generation',
      'nutrition-summary',
      'planning-summary',
    ],
  }).notNull(),
  status: text('status', { enum: ['requested', 'succeeded', 'failed'] }).notNull(),
  sourceDigest: text('source_digest').notNull(),
  sourceLabel: text('source_label').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  reasoningEffort: text('reasoning_effort'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  threadId: text('thread_id'),
  actionId: text('action_id'),
  summaryId: text('summary_id'),
  errorCode: text('error_code'),
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

export const aiWorkloadSettings = sqliteTable('ai_workload_settings', {
  workload: text('workload').primaryKey(),
  model: text('model').notNull(),
  reasoningEffort: text('reasoning_effort'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  version: integer('version').notNull().default(1),
  updatedByProfileId: text('updated_by_profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const aiProfileSettings = sqliteTable('ai_profile_settings', {
  profileId: text('profile_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  shareSharedRecipes: integer('share_shared_recipes', { mode: 'boolean' }).notNull().default(true),
  shareMealPlans: integer('share_meal_plans', { mode: 'boolean' }).notNull().default(true),
  shareDietaryPreferences: integer('share_dietary_preferences', { mode: 'boolean' })
    .notNull()
    .default(true),
  shareRecipePreferences: integer('share_recipe_preferences', { mode: 'boolean' })
    .notNull()
    .default(true),
  shareProfileGoals: integer('share_profile_goals', { mode: 'boolean' }).notNull().default(false),
  shareNutritionGoals: integer('share_nutrition_goals', { mode: 'boolean' })
    .notNull()
    .default(true),
  shareNutritionAggregates: integer('share_nutrition_aggregates', { mode: 'boolean' })
    .notNull()
    .default(true),
  shareRawDiary: integer('share_raw_diary', { mode: 'boolean' }).notNull().default(false),
  shareIdentity: integer('share_identity', { mode: 'boolean' }).notNull().default(false),
  sharePersonalMetrics: integer('share_personal_metrics', { mode: 'boolean' })
    .notNull()
    .default(false),
  shareWeight: integer('share_weight', { mode: 'boolean' }).notNull().default(false),
  dailySummaryEnabled: integer('daily_summary_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  weeklySummaryEnabled: integer('weekly_summary_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const aiChatThreads = sqliteTable(
  'ai_chat_threads',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('ai_chat_threads_profile_updated_idx').on(table.profileId, table.updatedAt)],
);

export const aiChatMessages = sqliteTable(
  'ai_chat_messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiChatThreads.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'tool'] }).notNull(),
    content: text('content').notNull(),
    model: text('model'),
    actionId: text('action_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('ai_chat_messages_thread_created_idx').on(table.threadId, table.createdAt)],
);

export const aiActionProposals = sqliteTable(
  'ai_action_proposals',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').references(() => aiChatThreads.id, { onDelete: 'set null' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'cancelled', 'expired', 'failed'],
    }).notNull(),
    payload: text('payload').notNull(),
    preview: text('preview').notNull(),
    sourceDigest: text('source_digest').notNull(),
    result: text('result'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    decidedAt: integer('decided_at', { mode: 'timestamp' }),
  },
  (table) => [index('ai_action_proposals_profile_status_idx').on(table.profileId, table.status)],
);

export const aiActionPreviewImages = sqliteTable('ai_action_preview_images', {
  actionId: text('action_id')
    .primaryKey()
    .references(() => aiActionProposals.id, { onDelete: 'cascade' }),
  imageId: text('image_id').notNull().unique(),
  storageKey: text('storage_key').notNull().unique(),
  altText: text('alt_text').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  model: text('model').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const aiPeriodicSummaries = sqliteTable(
  'ai_periodic_summaries',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['daily_nutrition', 'weekly_nutrition', 'weekly_planning'],
    }).notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    headline: text('headline').notNull(),
    body: text('body').notNull(),
    highlights: text('highlights').notNull(),
    caveats: text('caveats').notNull(),
    evidence: text('evidence').notNull(),
    sourceDigest: text('source_digest').notNull(),
    model: text('model').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('ai_periodic_summaries_period_idx').on(
      table.profileId,
      table.kind,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const aiSummaryJobs = sqliteTable(
  'ai_summary_jobs',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['daily_nutrition', 'weekly_nutrition', 'weekly_planning'],
    }).notNull(),
    dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
    status: text('status', { enum: ['pending', 'running', 'complete', 'failed'] }).notNull(),
    leaseUntil: integer('lease_until', { mode: 'timestamp' }),
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('ai_summary_jobs_profile_kind_idx').on(table.profileId, table.kind)],
);

export const mealPlanEntries = sqliteTable(
  'meal_plan_entries',
  {
    id: text('id').primaryKey(),
    plannedFor: text('planned_for').notNull(),
    meal: text('meal').notNull(),
    recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }),
    recipeRevision: integer('recipe_revision'),
    recipeCalculationId: text('recipe_calculation_id').references(
      () => recipeNutritionCalculations.id,
      { onDelete: 'restrict' },
    ),
    recipeTitleSnapshot: text('recipe_title_snapshot').notNull().default(''),
    recipeIngredientsSnapshot: text('recipe_ingredients_snapshot')
      .notNull()
      .default('{"baseServings":"","ingredients":[]}'),
    title: text('title').notNull().default(''),
    servings: integer('servings').notNull(),
    note: text('note').notNull(),
    status: text('status', { enum: ['planned', 'skipped', 'cancelled'] })
      .notNull()
      .default('planned'),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    updatedByProfileId: text('updated_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('meal_plan_entries_status_idx').on(table.status)],
);

export const mealPlanLeftoverLinks = sqliteTable(
  'meal_plan_leftover_links',
  {
    id: text('id').primaryKey(),
    sourceEntryId: text('source_entry_id')
      .notNull()
      .references(() => mealPlanEntries.id, { onDelete: 'cascade' }),
    destinationEntryId: text('destination_entry_id')
      .notNull()
      .references(() => mealPlanEntries.id, { onDelete: 'cascade' }),
    servings: real('servings').notNull(),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('meal_plan_leftover_destination_idx').on(table.destinationEntryId),
    index('meal_plan_leftover_source_idx').on(table.sourceEntryId),
  ],
);

export const shoppingAisles = sqliteTable('shopping_aisles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const supermarketProfiles = sqliteTable(
  'supermarket_profiles',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    locationLabel: text('location_label').notNull().default(''),
    normalizedLocation: text('normalized_location').notNull().default(''),
    notes: text('notes').notNull().default(''),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    updatedByProfileId: text('updated_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('supermarket_profiles_household_identity_idx').on(
      table.householdId,
      table.normalizedName,
      table.normalizedLocation,
    ),
    index('supermarket_profiles_household_archived_idx').on(table.householdId, table.archivedAt),
  ],
);

export const householdListSettings = sqliteTable('household_list_settings', {
  householdId: text('household_id')
    .primaryKey()
    .references(() => households.id, { onDelete: 'cascade' }),
  defaultSupermarketProfileId: text('default_supermarket_profile_id').references(
    () => supermarketProfiles.id,
    { onDelete: 'set null' },
  ),
  completedItemsBehavior: text('completed_items_behavior', {
    enum: ['completed_section', 'hide', 'in_place'],
  })
    .notNull()
    .default('completed_section'),
  openPantryPurchaseOnCheck: integer('open_pantry_purchase_on_check', { mode: 'boolean' })
    .notNull()
    .default(true),
  keepScreenAwake: integer('keep_screen_awake', { mode: 'boolean' }).notNull().default(false),
  updatedByProfileId: text('updated_by_profile_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const supermarketProfileAisles = sqliteTable(
  'supermarket_profile_aisles',
  {
    id: text('id').primaryKey(),
    supermarketProfileId: text('supermarket_profile_id')
      .notNull()
      .references(() => supermarketProfiles.id, { onDelete: 'cascade' }),
    aisleId: text('aisle_id')
      .notNull()
      .references(() => shoppingAisles.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    position: integer('position').notNull(),
    matchTerms: text('match_terms').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('supermarket_profile_aisles_identity_idx').on(
      table.supermarketProfileId,
      table.aisleId,
    ),
    uniqueIndex('supermarket_profile_aisles_position_idx').on(
      table.supermarketProfileId,
      table.position,
    ),
  ],
);

export const supermarketItemAisleMappings = sqliteTable(
  'supermarket_item_aisle_mappings',
  {
    id: text('id').primaryKey(),
    supermarketProfileId: text('supermarket_profile_id')
      .notNull()
      .references(() => supermarketProfiles.id, { onDelete: 'cascade' }),
    identityType: text('identity_type', { enum: ['item_name', 'pantry_product'] }).notNull(),
    identityValue: text('identity_value').notNull(),
    aisleId: text('aisle_id').references(() => shoppingAisles.id, { onDelete: 'set null' }),
    updatedByProfileId: text('updated_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('supermarket_item_mapping_identity_idx').on(
      table.supermarketProfileId,
      table.identityType,
      table.identityValue,
    ),
    index('supermarket_item_mapping_aisle_idx').on(table.aisleId),
  ],
);

export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  weekStart: text('week_start').notNull(),
  weekEnd: text('week_end').notNull(),
  sourceMode: text('source_mode', {
    enum: ['manual', 'planned_all', 'pantry_missing', 'pantry_all'],
  })
    .notNull()
    .default('manual'),
  sourceKey: text('source_key').unique(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  supermarketProfileId: text('supermarket_profile_id').references(() => supermarketProfiles.id, {
    onDelete: 'set null',
  }),
  createdByProfileId: text('created_by_profile_id')
    .notNull()
    .references(() => profiles.id),
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
  shoppingState: text('shopping_state', {
    enum: ['to_buy', 'in_cart', 'cant_find', 'sourced'],
  })
    .notNull()
    .default('to_buy'),
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
  mealPlanEntryId: text('meal_plan_entry_id').references(() => mealPlanEntries.id, {
    onDelete: 'set null',
  }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const pantryProducts = sqliteTable(
  'pantry_products',
  {
    id: text('id').primaryKey(),
    normalizedName: text('normalized_name').notNull(),
    displayName: text('display_name').notNull(),
    brand: text('brand').notNull().default(''),
    variant: text('variant').notNull().default(''),
    category: text('category').notNull().default(''),
    subcategory: text('subcategory').notNull().default(''),
    defaultInventoryUnit: text('default_inventory_unit').notNull().default('each'),
    defaultPackageAmount: real('default_package_amount'),
    defaultPackageUnit: text('default_package_unit').notNull().default(''),
    defaultStorageType: text('default_storage_type', {
      enum: ['pantry', 'refrigerator', 'freezer', 'counter', 'other'],
    })
      .notNull()
      .default('pantry'),
    imageStorageKey: text('image_storage_key'),
    dietaryTags: text('dietary_tags').notNull().default('[]'),
    allergens: text('allergens').notNull().default('[]'),
    storageInstructions: text('storage_instructions').notNull().default(''),
    defaultShelfLifeDays: integer('default_shelf_life_days'),
    shelfLifeAfterOpeningDays: integer('shelf_life_after_opening_days'),
    isStaple: integer('is_staple', { mode: 'boolean' }).notNull().default(false),
    preferredBrand: text('preferred_brand').notNull().default(''),
    preferredStore: text('preferred_store').notNull().default(''),
    minimumStock: real('minimum_stock'),
    targetStock: real('target_stock'),
    reorderThreshold: real('reorder_threshold'),
    preferredPurchaseQuantity: real('preferred_purchase_quantity'),
    stockUnit: text('stock_unit').notNull().default(''),
    suggestGroceryRestock: integer('suggest_grocery_restock', { mode: 'boolean' })
      .notNull()
      .default(false),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    updatedByProfileId: text('updated_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('pantry_products_identity_idx').on(
      table.normalizedName,
      table.brand,
      table.variant,
    ),
    index('pantry_products_category_idx').on(table.category, table.archivedAt),
    index('pantry_products_staple_idx').on(table.isStaple, table.archivedAt),
  ],
);

export const pantryProductAliases = sqliteTable(
  'pantry_product_aliases',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('pantry_product_alias_identity_idx').on(table.productId, table.normalizedAlias),
    index('pantry_product_alias_search_idx').on(table.normalizedAlias),
  ],
);

export const pantryProductIdentifiers = sqliteTable(
  'pantry_product_identifiers',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id, { onDelete: 'cascade' }),
    identifierType: text('identifier_type', {
      enum: ['upc_a', 'ean_13', 'gtin', 'internal', 'provider'],
    }).notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value'),
    source: text('source').notNull().default('household'),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('pantry_product_identifier_identity_idx').on(
      table.identifierType,
      table.value,
      table.source,
    ),
    uniqueIndex('pantry_product_identifier_verified_gtin_idx').on(table.normalizedValue),
    index('pantry_product_identifier_product_idx').on(table.productId),
  ],
);

export const foodProviderSnapshots = sqliteTable(
  'food_provider_snapshots',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['open_food_facts', 'usda_fdc'] }).notNull(),
    providerRecordId: text('provider_record_id').notNull(),
    dataType: text('data_type').notNull().default(''),
    canonicalGtin: text('canonical_gtin'),
    normalizedPayload: text('normalized_payload').notNull(),
    providerMetadata: text('provider_metadata').notNull().default('{}'),
    contentHash: text('content_hash').notNull(),
    schemaVersion: text('schema_version').notNull(),
    sourceUrl: text('source_url').notNull().default(''),
    citation: text('citation').notNull().default(''),
    license: text('license').notNull().default(''),
    retrievedAt: integer('retrieved_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('food_provider_snapshot_identity_idx').on(
      table.provider,
      table.providerRecordId,
      table.contentHash,
    ),
    index('food_provider_snapshot_gtin_idx').on(table.canonicalGtin),
  ],
);

export const pantryProductProviderLinks = sqliteTable(
  'pantry_product_provider_links',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id, { onDelete: 'cascade' }),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => foodProviderSnapshots.id, { onDelete: 'restrict' }),
    relation: text('relation', { enum: ['selected', 'alternative', 'enrichment'] }).notNull(),
    fieldsUsed: text('fields_used').notNull().default('[]'),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('pantry_product_provider_link_identity_idx').on(
      table.productId,
      table.snapshotId,
      table.relation,
    ),
    index('pantry_product_provider_link_product_idx').on(table.productId),
  ],
);

export const foodProviderCache = sqliteTable(
  'food_provider_cache',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['open_food_facts', 'usda_fdc'] }).notNull(),
    operation: text('operation', { enum: ['barcode', 'search', 'details'] }).notNull(),
    cacheKey: text('cache_key').notNull(),
    resultKind: text('result_kind', {
      enum: ['success', 'not_found', 'rate_limited', 'transient_failure'],
    }).notNull(),
    payload: text('payload').notNull().default('null'),
    schemaVersion: text('schema_version').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    staleUntil: integer('stale_until', { mode: 'timestamp' }).notNull(),
    retryAt: integer('retry_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('food_provider_cache_identity_idx').on(
      table.provider,
      table.operation,
      table.cacheKey,
    ),
    index('food_provider_cache_expiry_idx').on(table.staleUntil),
  ],
);

export const foodProviderRateLimits = sqliteTable(
  'food_provider_rate_limits',
  {
    provider: text('provider', { enum: ['open_food_facts', 'usda_fdc'] }).notNull(),
    operation: text('operation', { enum: ['barcode', 'search', 'details'] }).notNull(),
    windowStartedAt: integer('window_started_at', { mode: 'timestamp' }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    upstreamLimit: integer('upstream_limit'),
    upstreamRemaining: integer('upstream_remaining'),
    retryAt: integer('retry_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.operation] })],
);

export const foodCatalogImportOperations = sqliteTable('food_catalog_import_operations', {
  id: text('id').primaryKey(),
  requestDigest: text('request_digest').notNull(),
  destination: text('destination', { enum: ['catalog', 'pantry'] }).notNull(),
  productId: text('product_id')
    .notNull()
    .references(() => pantryProducts.id, { onDelete: 'restrict' }),
  result: text('result').notNull(),
  actorProfileId: text('actor_profile_id')
    .notNull()
    .references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const pantryLocations = sqliteTable(
  'pantry_locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    parentId: text('parent_id'),
    storageType: text('storage_type', {
      enum: ['pantry', 'refrigerator', 'freezer', 'counter', 'other'],
    }).notNull(),
    description: text('description').notNull().default(''),
    position: integer('position').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    updatedByProfileId: text('updated_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.parentId], foreignColumns: [table.id] }).onDelete('restrict'),
    index('pantry_locations_parent_position_idx').on(table.parentId, table.position),
    index('pantry_locations_type_idx').on(table.storageType, table.archivedAt),
  ],
);

export const pantryBatches = sqliteTable(
  'pantry_batches',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id),
    quantityRemaining: real('quantity_remaining'),
    originalQuantity: real('original_quantity'),
    unit: text('unit').notNull(),
    packageCount: real('package_count'),
    amountPerPackage: real('amount_per_package'),
    packageUnit: text('package_unit').notNull().default(''),
    approximateState: text('approximate_state', {
      enum: ['full', 'three_quarters', 'half', 'quarter', 'almost_empty', 'unknown'],
    }),
    locationId: text('location_id')
      .notNull()
      .references(() => pantryLocations.id),
    sublocation: text('sublocation').notNull().default(''),
    purchaseDate: text('purchase_date'),
    bestBeforeDate: text('best_before_date'),
    useByDate: text('use_by_date'),
    sellByDate: text('sell_by_date'),
    openedDate: text('opened_date'),
    frozenDate: text('frozen_date'),
    thawedDate: text('thawed_date'),
    preparedDate: text('prepared_date'),
    expiryPrecision: text('expiry_precision', {
      enum: ['exact', 'estimated', 'month_only', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    status: text('status', {
      enum: [
        'unopened',
        'opened',
        'frozen',
        'thawed',
        'reserved',
        'depleted',
        'discarded',
        'donated',
      ],
    })
      .notNull()
      .default('unopened'),
    purchasePriceCents: integer('purchase_price_cents'),
    source: text('source').notNull().default(''),
    notes: text('notes').notNull().default(''),
    excludeFromGrocery: integer('exclude_from_grocery', { mode: 'boolean' })
      .notNull()
      .default(false),
    sourceRecipeId: text('source_recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    sourceMealPlanEntryId: text('source_meal_plan_entry_id').references(() => mealPlanEntries.id, {
      onDelete: 'set null',
    }),
    sourceShoppingListItemId: text('source_shopping_list_item_id').references(
      () => shoppingListItems.id,
      { onDelete: 'set null' },
    ),
    version: integer('version').notNull().default(1),
    createdByProfileId: text('created_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    updatedByProfileId: text('updated_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('pantry_batches_product_status_idx').on(table.productId, table.status),
    index('pantry_batches_location_status_idx').on(table.locationId, table.status),
    index('pantry_batches_expiry_idx').on(table.useByDate, table.bestBeforeDate),
    index('pantry_batches_updated_idx').on(table.updatedAt),
  ],
);

export const pantryInventoryEvents = sqliteTable(
  'pantry_inventory_events',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => pantryBatches.id),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id),
    eventType: text('event_type', {
      enum: [
        'item_added',
        'item_edited',
        'quantity_increased',
        'quantity_decreased',
        'package_opened',
        'item_moved',
        'item_frozen',
        'item_thawed',
        'item_depleted',
        'item_discarded',
        'item_donated',
        'item_restored',
        'inventory_correction',
        'purchase_added',
        'recipe_used',
        'action_undone',
      ],
    }).notNull(),
    previousQuantity: real('previous_quantity'),
    newQuantity: real('new_quantity'),
    quantityChanged: real('quantity_changed'),
    unit: text('unit').notNull().default(''),
    previousState: text('previous_state').notNull(),
    newState: text('new_state').notNull(),
    reason: text('reason').notNull().default(''),
    relatedRecipeId: text('related_recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    relatedMealPlanEntryId: text('related_meal_plan_entry_id').references(
      () => mealPlanEntries.id,
      { onDelete: 'set null' },
    ),
    relatedShoppingListItemId: text('related_shopping_list_item_id').references(
      () => shoppingListItems.id,
      { onDelete: 'set null' },
    ),
    relatedCookSessionId: text('related_cook_session_id').references(() => cookSessions.id, {
      onDelete: 'set null',
    }),
    note: text('note').notNull().default(''),
    actorProfileId: text('actor_profile_id')
      .notNull()
      .references(() => profiles.id),
    undoOfEventId: text('undo_of_event_id'),
    reversedByEventId: text('reversed_by_event_id'),
    batchSequence: integer('batch_sequence').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('pantry_events_batch_created_idx').on(table.batchId, table.createdAt),
    uniqueIndex('pantry_events_batch_sequence_idx').on(table.batchId, table.batchSequence),
    index('pantry_events_product_created_idx').on(table.productId, table.createdAt),
    foreignKey({ columns: [table.undoOfEventId], foreignColumns: [table.id] }).onDelete('restrict'),
    foreignKey({ columns: [table.reversedByEventId], foreignColumns: [table.id] }).onDelete(
      'restrict',
    ),
  ],
);

export const recipeIngredientProductMappings = sqliteTable(
  'recipe_ingredient_product_mappings',
  {
    recipeIngredientId: text('recipe_ingredient_id')
      .primaryKey()
      .references(() => recipeIngredients.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id),
    matchType: text('match_type', {
      enum: ['manual', 'exact', 'alias', 'suggested'],
    }).notNull(),
    compatibleVariant: integer('compatible_variant', { mode: 'boolean' }).notNull().default(false),
    isOptional: integer('is_optional', { mode: 'boolean' }).notNull().default(false),
    mappedByProfileId: text('mapped_by_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('recipe_ingredient_product_idx').on(table.productId)],
);

export const pantryShoppingItemDetails = sqliteTable(
  'pantry_shopping_item_details',
  {
    shoppingListItemId: text('shopping_list_item_id')
      .primaryKey()
      .references(() => shoppingListItems.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => pantryProducts.id, { onDelete: 'restrict' }),
    demandState: text('demand_state', { enum: ['shortage', 'uncertain', 'manual'] }).notNull(),
    generatedQuantity: real('generated_quantity'),
    generatedUnit: text('generated_unit').notNull().default(''),
    shortageQuantity: real('shortage_quantity'),
    uncertaintyReason: text('uncertainty_reason'),
    formulaInputs: text('formula_inputs').notNull(),
    provenance: text('provenance').notNull(),
    generationKey: text('generation_key').notNull(),
    manualQuantityOverride: integer('manual_quantity_override', { mode: 'boolean' })
      .notNull()
      .default(false),
    manualUnitOverride: integer('manual_unit_override', { mode: 'boolean' })
      .notNull()
      .default(false),
    manualItemOverride: integer('manual_item_override', { mode: 'boolean' })
      .notNull()
      .default(false),
    manualNoteOverride: integer('manual_note_override', { mode: 'boolean' })
      .notNull()
      .default(false),
    generationMode: text('generation_mode', { enum: ['missing', 'all'] })
      .notNull()
      .default('missing'),
    coverageState: text('coverage_state', {
      enum: ['active', 'covered', 'ignored', 'inaccurate'],
    })
      .notNull()
      .default('active'),
    manualExtraQuantity: real('manual_extra_quantity').notNull().default(0),
    manualExtraUnit: text('manual_extra_unit').notNull().default(''),
    coveredQuantity: real('covered_quantity').notNull().default(0),
    coveredUnit: text('covered_unit').notNull().default(''),
    purchasedQuantity: real('purchased_quantity').notNull().default(0),
    purchasedUnit: text('purchased_unit').notNull().default(''),
    controlNote: text('control_note').notNull().default(''),
    generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('pantry_shopping_details_product_idx').on(table.productId),
    index('pantry_shopping_details_generation_idx').on(table.generationKey),
    index('pantry_shopping_details_coverage_idx').on(table.coverageState),
  ],
);

export const pantryPurchaseIntakes = sqliteTable(
  'pantry_purchase_intakes',
  {
    id: text('id').primaryKey(),
    shoppingListItemId: text('shopping_list_item_id')
      .notNull()
      .references(() => shoppingListItems.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    batchId: text('batch_id')
      .notNull()
      .references(() => pantryBatches.id, { onDelete: 'restrict' }),
    locationId: text('location_id')
      .notNull()
      .references(() => pantryLocations.id, { onDelete: 'restrict' }),
    actorProfileId: text('actor_profile_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('pantry_purchase_intake_idempotency_idx').on(
      table.shoppingListItemId,
      table.idempotencyKey,
    ),
  ],
);

export const pantryCookSessionPlans = sqliteTable('pantry_cook_session_plans', {
  cookSessionId: text('cook_session_id')
    .primaryKey()
    .references(() => cookSessions.id, { onDelete: 'cascade' }),
  state: text('state', { enum: ['preview', 'confirmed', 'undone'] }).notNull(),
  formulaInputs: text('formula_inputs').notNull(),
  provenance: text('provenance').notNull(),
  actorProfileId: text('actor_profile_id')
    .notNull()
    .references(() => profiles.id),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
  undoneAt: integer('undone_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const pantryCookSessionDeductions = sqliteTable(
  'pantry_cook_session_deductions',
  {
    id: text('id').primaryKey(),
    cookSessionId: text('cook_session_id')
      .notNull()
      .references(() => cookSessions.id, { onDelete: 'restrict' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => pantryBatches.id, { onDelete: 'restrict' }),
    inventoryEventId: text('inventory_event_id')
      .notNull()
      .references(() => pantryInventoryEvents.id, { onDelete: 'restrict' }),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id, { onDelete: 'restrict' }),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    batchVersionAfter: integer('batch_version_after').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('pantry_cook_deductions_session_idx').on(table.cookSessionId)],
);

export const pantryCookSessionLeftovers = sqliteTable(
  'pantry_cook_session_leftovers',
  {
    id: text('id').primaryKey(),
    cookSessionId: text('cook_session_id')
      .notNull()
      .references(() => cookSessions.id, { onDelete: 'restrict' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => pantryBatches.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('pantry_cook_leftover_batch_idx').on(table.batchId)],
);

export const nutrientDefinitions = sqliteTable('nutrient_definitions', {
  code: text('code').primaryKey(),
  canonicalName: text('canonical_name').notNull(),
  displayName: text('display_name').notNull(),
  aliases: text('aliases').notNull().default('[]'),
  category: text('category', {
    enum: ['energy', 'macronutrient', 'mineral', 'vitamin', 'other'],
  }).notNull(),
  canonicalUnit: text('canonical_unit').notNull(),
  displayPrecision: integer('display_precision').notNull(),
  defaultSemantic: text('default_semantic', {
    enum: ['target', 'minimum', 'range', 'limit', 'informational'],
  }).notNull(),
  upperReferencePossible: integer('upper_reference_possible', { mode: 'boolean' })
    .notNull()
    .default(false),
  defaultDashboard: integer('default_dashboard', { mode: 'boolean' }).notNull().default(false),
  displayOrder: integer('display_order').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const nutritionDataSources = sqliteTable(
  'nutrition_data_sources',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type', {
      enum: ['legacy_recipe', 'manual', 'provider', 'laboratory', 'calculated', 'reference'],
    }).notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull().default(''),
    version: text('version').notNull().default(''),
    sourceUrl: text('source_url').notNull().default(''),
    citation: text('citation').notNull().default(''),
    license: text('license').notNull().default(''),
    retrievedAt: integer('retrieved_at', { mode: 'timestamp' }),
    priority: integer('priority').notNull().default(0),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_sources_identity_idx').on(
      table.sourceType,
      table.name,
      table.provider,
      table.version,
    ),
    index('nutrition_sources_priority_idx').on(table.priority),
  ],
);

export const foodNutritionRecords = sqliteTable(
  'food_nutrition_records',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => pantryProducts.id),
    revision: integer('revision').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => nutritionDataSources.id),
    sourceRecordKey: text('source_record_key').notNull().default(''),
    basisType: text('basis_type', {
      enum: ['per_100g', 'per_100ml', 'per_serving', 'per_unit'],
    }).notNull(),
    basisAmount: real('basis_amount').notNull(),
    basisUnit: text('basis_unit').notNull(),
    servingWeightGrams: real('serving_weight_grams'),
    densityGramsPerMilliliter: real('density_grams_per_milliliter'),
    pieceWeightGrams: real('piece_weight_grams'),
    confidence: real('confidence').notNull(),
    completeness: real('completeness').notNull(),
    supersedesRecordId: text('supersedes_record_id'),
    recordedByProfileId: text('recorded_by_profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    notes: text('notes').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('food_nutrition_product_revision_idx').on(table.productId, table.revision),
    index('food_nutrition_product_created_idx').on(table.productId, table.createdAt),
    index('food_nutrition_source_idx').on(table.sourceId),
    foreignKey({ columns: [table.supersedesRecordId], foreignColumns: [table.id] }).onDelete(
      'restrict',
    ),
  ],
);

export const foodNutrientValues = sqliteTable(
  'food_nutrient_values',
  {
    recordId: text('record_id')
      .notNull()
      .references(() => foodNutritionRecords.id, { onDelete: 'cascade' }),
    nutrientCode: text('nutrient_code')
      .notNull()
      .references(() => nutrientDefinitions.code),
    amount: real('amount').notNull(),
    confidence: real('confidence'),
    sourceNote: text('source_note').notNull().default(''),
  },
  (table) => [
    primaryKey({ columns: [table.recordId, table.nutrientCode] }),
    index('food_nutrient_code_idx').on(table.nutrientCode),
  ],
);

export const nutritionCalculationVersions = sqliteTable(
  'nutrition_calculation_versions',
  {
    id: text('id').primaryKey(),
    algorithm: text('algorithm').notNull(),
    version: text('version').notNull(),
    energyFactorsVersion: text('energy_factors_version').notNull(),
    retentionFactorsVersion: text('retention_factors_version').notNull().default(''),
    implementationDigest: text('implementation_digest').notNull(),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_calculation_version_identity_idx').on(
      table.algorithm,
      table.version,
      table.implementationDigest,
    ),
  ],
);

export const recipeNutritionCalculations = sqliteTable(
  'recipe_nutrition_calculations',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    recipeRevision: integer('recipe_revision').notNull(),
    revision: integer('revision').notNull(),
    calculationVersionId: text('calculation_version_id')
      .notNull()
      .references(() => nutritionCalculationVersions.id),
    sourceId: text('source_id')
      .notNull()
      .references(() => nutritionDataSources.id),
    sourceDigest: text('source_digest').notNull(),
    servingCount: real('serving_count'),
    finalWeightGrams: real('final_weight_grams'),
    confidence: real('confidence').notNull(),
    completeness: real('completeness').notNull(),
    supersedesCalculationId: text('supersedes_calculation_id'),
    calculatedByProfileId: text('calculated_by_profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    notes: text('notes').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('recipe_nutrition_revision_idx').on(table.recipeId, table.revision),
    uniqueIndex('recipe_nutrition_source_digest_idx').on(
      table.recipeId,
      table.recipeRevision,
      table.sourceDigest,
    ),
    index('recipe_nutrition_recipe_created_idx').on(table.recipeId, table.createdAt),
    foreignKey({ columns: [table.supersedesCalculationId], foreignColumns: [table.id] }).onDelete(
      'restrict',
    ),
  ],
);

export const recipeNutritionContributions = sqliteTable(
  'recipe_nutrition_contributions',
  {
    id: text('id').primaryKey(),
    calculationId: text('calculation_id')
      .notNull()
      .references(() => recipeNutritionCalculations.id, { onDelete: 'cascade' }),
    recipeIngredientId: text('recipe_ingredient_id').references(() => recipeIngredients.id, {
      onDelete: 'set null',
    }),
    productNutritionRecordId: text('product_nutrition_record_id').references(
      () => foodNutritionRecords.id,
      { onDelete: 'set null' },
    ),
    amountMultiplier: real('amount_multiplier').notNull(),
    ediblePortion: real('edible_portion').notNull(),
    drainedYield: real('drained_yield').notNull(),
    optionalIncluded: integer('optional_included', { mode: 'boolean' }).notNull(),
    retentionFactors: text('retention_factors').notNull().default('{}'),
    confidence: real('confidence').notNull(),
    completeness: real('completeness').notNull(),
    missingReason: text('missing_reason').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('recipe_nutrition_contribution_calculation_idx').on(table.calculationId),
    index('recipe_nutrition_contribution_ingredient_idx').on(table.recipeIngredientId),
  ],
);

export const recipeNutrientValues = sqliteTable(
  'recipe_nutrient_values',
  {
    calculationId: text('calculation_id')
      .notNull()
      .references(() => recipeNutritionCalculations.id, { onDelete: 'cascade' }),
    nutrientCode: text('nutrient_code')
      .notNull()
      .references(() => nutrientDefinitions.code),
    amount: real('amount').notNull(),
    confidence: real('confidence'),
    completeness: real('completeness'),
  },
  (table) => [
    primaryKey({ columns: [table.calculationId, table.nutrientCode] }),
    index('recipe_nutrient_code_idx').on(table.nutrientCode),
  ],
);

export const nutritionPrincipals = sqliteTable('nutrition_principals', {
  id: text('id').primaryKey(),
  credentialHash: text('credential_hash').notNull(),
  accessVersion: integer('access_version').notNull().default(1),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  lastAuthenticatedAt: integer('last_authenticated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const nutritionProfiles = sqliteTable(
  'nutrition_profiles',
  {
    id: text('id').primaryKey(),
    ownerPrincipalId: text('owner_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    linkedHouseholdProfileId: text('linked_household_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url').notNull().default(''),
    profileType: text('profile_type', {
      enum: ['adult', 'dependent', 'guest', 'unassigned'],
    }).notNull(),
    dateOfBirth: text('date_of_birth'),
    heightCentimeters: real('height_centimeters'),
    currentWeightKilograms: real('current_weight_kilograms'),
    measurementSystem: text('measurement_system', { enum: ['metric', 'imperial'] }).notNull(),
    referenceSexCategory: text('reference_sex_category', { enum: ['female', 'male'] }),
    activityLevel: text('activity_level', {
      enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
    }),
    nutritionGoalType: text('nutrition_goal_type', {
      enum: ['none', 'maintain', 'gain', 'loss', 'custom'],
    }).notNull(),
    targetWeightKilograms: real('target_weight_kilograms'),
    targetDate: text('target_date'),
    explicitlyEnteredLifeStage: text('explicitly_entered_life_stage', {
      enum: ['pregnant', 'breastfeeding'],
    }),
    dietaryPreferences: text('dietary_preferences').notNull().default('[]'),
    foodAllergies: text('food_allergies').notNull().default('[]'),
    dietaryExclusions: text('dietary_exclusions').notNull().default('[]'),
    estimatedTargetsEnabled: integer('estimated_targets_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    estimatedTargetConsent: integer('estimated_target_consent', { mode: 'boolean' })
      .notNull()
      .default(false),
    weightTrackingEnabled: integer('weight_tracking_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    comparisonVisibility: text('comparison_visibility', {
      enum: ['hidden', 'named', 'anonymized'],
    }).notNull(),
    diaryVisibility: text('diary_visibility', { enum: ['private', 'authorized'] }).notNull(),
    preferredEnergyUnit: text('preferred_energy_unit', { enum: ['kcal', 'kJ'] }).notNull(),
    dailyResetTimezone: text('daily_reset_timezone').notNull(),
    weekStartsOn: integer('week_starts_on').notNull(),
    referenceJurisdiction: text('reference_jurisdiction').notNull(),
    visibleNutrientCodes: text('visible_nutrient_codes')
      .notNull()
      .default(
        '["fiber","calcium","iron","potassium","vitamin_d","sodium","added_sugars","saturated_fat"]',
      ),
    trendRangeDays: integer('trend_range_days').notNull().default(7),
    showPlannedNutrition: integer('show_planned_nutrition', { mode: 'boolean' })
      .notNull()
      .default(true),
    showRecipeCardNutrition: integer('show_recipe_card_nutrition', { mode: 'boolean' })
      .notNull()
      .default(true),
    recipeCardNutrientCodes: text('recipe_card_nutrient_codes')
      .notNull()
      .default('["energy_kcal","protein","fiber"]'),
    showMealPlanNutrition: integer('show_meal_plan_nutrition', { mode: 'boolean' })
      .notNull()
      .default(true),
    version: integer('version').notNull().default(1),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_profiles_owner_unique_idx').on(table.ownerPrincipalId),
    uniqueIndex('nutrition_profiles_household_link_unique_idx').on(table.linkedHouseholdProfileId),
  ],
);

export const nutritionPermissionVersions = sqliteTable(
  'nutrition_permission_versions',
  {
    id: text('id').primaryKey(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id),
    principalId: text('principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    revision: integer('revision').notNull(),
    state: text('state', { enum: ['granted', 'revoked'] }).notNull(),
    role: text('role', { enum: ['guardian', 'viewer'] }).notNull(),
    canViewDiary: integer('can_view_diary', { mode: 'boolean' }).notNull(),
    canViewMeasurements: integer('can_view_measurements', { mode: 'boolean' }).notNull(),
    canManageProfile: integer('can_manage_profile', { mode: 'boolean' }).notNull(),
    canManageGoals: integer('can_manage_goals', { mode: 'boolean' }).notNull(),
    canViewComparison: integer('can_view_comparison', { mode: 'boolean' }).notNull(),
    canExportData: integer('can_export_data', { mode: 'boolean' }).notNull(),
    canDeleteData: integer('can_delete_data', { mode: 'boolean' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    supersedesPermissionId: text('supersedes_permission_id'),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_permission_revision_idx').on(
      table.nutritionProfileId,
      table.principalId,
      table.revision,
    ),
    index('nutrition_permission_profile_idx').on(table.nutritionProfileId),
    index('nutrition_permission_actor_idx').on(table.actorHouseholdProfileId),
    foreignKey({ columns: [table.supersedesPermissionId], foreignColumns: [table.id] }).onDelete(
      'restrict',
    ),
  ],
);

export const nutritionGoalVersions = sqliteTable(
  'nutrition_goal_versions',
  {
    id: text('id').primaryKey(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id),
    seriesId: text('series_id').notNull(),
    revision: integer('revision').notNull(),
    nutrientCode: text('nutrient_code')
      .notNull()
      .references(() => nutrientDefinitions.code),
    unit: text('unit').notNull(),
    sourceType: text('source_type', {
      enum: ['user_defined', 'clinician_defined', 'reference'],
    }).notNull(),
    sourceReferenceId: text('source_reference_id'),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on'),
    state: text('state', { enum: ['active', 'paused', 'archived'] }).notNull(),
    kind: text('kind', { enum: ['target', 'minimum', 'range', 'limit'] }).notNull(),
    value: real('value'),
    minimum: real('minimum'),
    maximum: real('maximum'),
    note: text('note').notNull().default(''),
    supersedesGoalVersionId: text('supersedes_goal_version_id'),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_goal_series_revision_idx').on(table.seriesId, table.revision),
    index('nutrition_goal_profile_idx').on(table.nutritionProfileId),
    index('nutrition_goal_actor_idx').on(table.actorHouseholdProfileId),
    foreignKey({ columns: [table.supersedesGoalVersionId], foreignColumns: [table.id] }).onDelete(
      'restrict',
    ),
  ],
);

export const nutritionBodyMeasurements = sqliteTable(
  'nutrition_body_measurements',
  {
    id: text('id').primaryKey(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id),
    measuredAt: integer('measured_at', { mode: 'timestamp' }).notNull(),
    weightKilograms: real('weight_kilograms').notNull(),
    sourceType: text('source_type', { enum: ['manual', 'imported'] }).notNull(),
    approximate: integer('approximate', { mode: 'boolean' }).notNull(),
    note: text('note').notNull().default(''),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('nutrition_measurement_profile_time_idx').on(table.nutritionProfileId, table.measuredAt),
    index('nutrition_measurement_actor_idx').on(table.actorHouseholdProfileId),
  ],
);

export const nutritionInsightFeedback = sqliteTable(
  'nutrition_insight_feedback',
  {
    id: text('id').primaryKey(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id, { onDelete: 'restrict' }),
    recommendationKey: text('recommendation_key').notNull(),
    revision: integer('revision').notNull(),
    state: text('state', { enum: ['dismissed', 'helpful', 'not_helpful'] }).notNull(),
    reason: text('reason').notNull().default(''),
    supersedesFeedbackId: text('supersedes_feedback_id'),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id, { onDelete: 'restrict' }),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_insight_feedback_key_revision_idx').on(
      table.nutritionProfileId,
      table.recommendationKey,
      table.revision,
    ),
    index('nutrition_insight_feedback_profile_created_idx').on(
      table.nutritionProfileId,
      table.createdAt,
    ),
    index('nutrition_insight_feedback_actor_idx').on(table.actorHouseholdProfileId),
    foreignKey({
      columns: [table.supersedesFeedbackId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
  ],
);

export const nutritionPreparedRecipeInstances = sqliteTable(
  'nutrition_prepared_recipe_instances',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'restrict' }),
    recipeCalculationId: text('recipe_calculation_id')
      .notNull()
      .references(() => recipeNutritionCalculations.id, { onDelete: 'restrict' }),
    recipeNameSnapshot: text('recipe_name_snapshot').notNull(),
    mealPlanEntryId: text('meal_plan_entry_id').references(() => mealPlanEntries.id, {
      onDelete: 'restrict',
    }),
    cookSessionId: text('cook_session_id').references(() => cookSessions.id, {
      onDelete: 'restrict',
    }),
    actualServings: real('actual_servings').notNull(),
    finalWeightGrams: real('final_weight_grams'),
    calculationAlignment: text('calculation_alignment', {
      enum: ['as_calculated', 'requires_recalculation'],
    }).notNull(),
    includedOptionalIngredientIdsSnapshot: text(
      'included_optional_ingredient_ids_snapshot',
    ).notNull(),
    adjustmentsSnapshot: text('adjustments_snapshot').notNull(),
    note: text('note').notNull().default(''),
    requestDigest: text('request_digest').notNull(),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_prepared_cook_session_idx').on(table.cookSessionId),
    index('nutrition_prepared_recipe_created_idx').on(table.recipeId, table.createdAt),
    index('nutrition_prepared_principal_created_idx').on(
      table.createdByPrincipalId,
      table.createdAt,
    ),
    index('nutrition_prepared_actor_idx').on(table.actorHouseholdProfileId),
  ],
);

export const nutritionMealAllocationVersions = sqliteTable(
  'nutrition_meal_allocation_versions',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    revision: integer('revision').notNull(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id),
    mealPlanEntryId: text('meal_plan_entry_id').references(() => mealPlanEntries.id, {
      onDelete: 'restrict',
    }),
    cookSessionId: text('cook_session_id').references(() => cookSessions.id, {
      onDelete: 'restrict',
    }),
    preparedRecipeInstanceId: text('prepared_recipe_instance_id').references(
      () => nutritionPreparedRecipeInstances.id,
      { onDelete: 'restrict' },
    ),
    state: text('state', {
      enum: ['planned', 'served', 'eaten', 'skipped', 'leftover'],
    }).notNull(),
    servings: real('servings'),
    portionWeightGrams: real('portion_weight_grams'),
    intakeSeriesId: text('intake_series_id'),
    note: text('note').notNull().default(''),
    supersedesAllocationVersionId: text('supersedes_allocation_version_id'),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_allocation_series_revision_idx').on(table.seriesId, table.revision),
    index('nutrition_allocation_profile_created_idx').on(table.nutritionProfileId, table.createdAt),
    index('nutrition_allocation_meal_plan_idx').on(table.mealPlanEntryId),
    index('nutrition_allocation_cook_session_idx').on(table.cookSessionId),
    index('nutrition_allocation_prepared_idx').on(table.preparedRecipeInstanceId),
    index('nutrition_allocation_actor_idx').on(table.actorHouseholdProfileId),
    foreignKey({
      columns: [table.supersedesAllocationVersionId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
  ],
);

export const nutritionIntakeRevisions = sqliteTable(
  'nutrition_intake_revisions',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    revision: integer('revision').notNull(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    mealSlot: text('meal_slot', {
      enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'],
    }).notNull(),
    state: text('state', { enum: ['eaten', 'skipped', 'corrected', 'deleted'] }).notNull(),
    sourceType: text('source_type', { enum: ['recipe', 'product', 'manual'] }).notNull(),
    sourceNameSnapshot: text('source_name_snapshot').notNull().default(''),
    recipeId: text('recipe_id').references(() => recipes.id, { onDelete: 'restrict' }),
    productId: text('product_id').references(() => pantryProducts.id, { onDelete: 'restrict' }),
    recipeCalculationId: text('recipe_calculation_id').references(
      () => recipeNutritionCalculations.id,
      { onDelete: 'restrict' },
    ),
    foodNutritionRecordId: text('food_nutrition_record_id').references(
      () => foodNutritionRecords.id,
      { onDelete: 'restrict' },
    ),
    mealPlanEntryId: text('meal_plan_entry_id').references(() => mealPlanEntries.id, {
      onDelete: 'restrict',
    }),
    cookSessionId: text('cook_session_id').references(() => cookSessions.id, {
      onDelete: 'restrict',
    }),
    preparedRecipeInstanceId: text('prepared_recipe_instance_id').references(
      () => nutritionPreparedRecipeInstances.id,
      { onDelete: 'restrict' },
    ),
    quantity: real('quantity'),
    unit: text('unit'),
    servingCount: real('serving_count'),
    portionWeightGrams: real('portion_weight_grams'),
    provenanceSnapshot: text('provenance_snapshot'),
    revisionReason: text('revision_reason').notNull().default(''),
    supersedesIntakeRevisionId: text('supersedes_intake_revision_id'),
    createdByPrincipalId: text('created_by_principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_intake_series_revision_idx').on(table.seriesId, table.revision),
    index('nutrition_intake_profile_occurred_idx').on(table.nutritionProfileId, table.occurredAt),
    index('nutrition_intake_recipe_idx').on(table.recipeId),
    index('nutrition_intake_product_idx').on(table.productId),
    index('nutrition_intake_prepared_idx').on(table.preparedRecipeInstanceId),
    index('nutrition_intake_actor_idx').on(table.actorHouseholdProfileId),
    foreignKey({
      columns: [table.supersedesIntakeRevisionId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
  ],
);

export const nutritionConsumptionCommands = sqliteTable(
  'nutrition_consumption_commands',
  {
    id: text('id').primaryKey(),
    principalId: text('principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id),
    idempotencyKey: text('idempotency_key').notNull(),
    requestDigest: text('request_digest').notNull(),
    nutritionProfileId: text('nutrition_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id),
    preparedRecipeInstanceId: text('prepared_recipe_instance_id')
      .notNull()
      .references(() => nutritionPreparedRecipeInstances.id, { onDelete: 'restrict' }),
    intakeRevisionId: text('intake_revision_id')
      .notNull()
      .references(() => nutritionIntakeRevisions.id, { onDelete: 'restrict' }),
    allocationVersionId: text('allocation_version_id')
      .notNull()
      .references(() => nutritionMealAllocationVersions.id, { onDelete: 'restrict' }),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_consumption_principal_key_idx').on(
      table.principalId,
      table.idempotencyKey,
    ),
    index('nutrition_consumption_profile_created_idx').on(
      table.nutritionProfileId,
      table.createdAt,
    ),
    index('nutrition_consumption_actor_idx').on(table.actorHouseholdProfileId),
  ],
);

export const nutritionDiaryCommands = sqliteTable(
  'nutrition_diary_commands',
  {
    id: text('id').primaryKey(),
    principalId: text('principal_id')
      .notNull()
      .references(() => nutritionPrincipals.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    requestDigest: text('request_digest').notNull(),
    commandType: text('command_type', {
      enum: ['copy_entry', 'copy_day', 'move', 'restore', 'reassign'],
    }).notNull(),
    sourceProfileId: text('source_profile_id')
      .notNull()
      .references(() => nutritionProfiles.id, { onDelete: 'restrict' }),
    targetProfileId: text('target_profile_id').references(() => nutritionProfiles.id, {
      onDelete: 'restrict',
    }),
    resultSnapshot: text('result_snapshot').notNull(),
    actorHouseholdProfileId: text('actor_household_profile_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('nutrition_diary_command_principal_key_idx').on(
      table.principalId,
      table.idempotencyKey,
    ),
    index('nutrition_diary_command_source_created_idx').on(table.sourceProfileId, table.createdAt),
    index('nutrition_diary_command_target_created_idx').on(table.targetProfileId, table.createdAt),
    index('nutrition_diary_command_actor_idx').on(table.actorHouseholdProfileId),
  ],
);

export const nutritionIntakeNutrientValues = sqliteTable(
  'nutrition_intake_nutrient_values',
  {
    intakeRevisionId: text('intake_revision_id')
      .notNull()
      .references(() => nutritionIntakeRevisions.id, { onDelete: 'restrict' }),
    nutrientCode: text('nutrient_code')
      .notNull()
      .references(() => nutrientDefinitions.code),
    amount: real('amount').notNull(),
    sourceIdsSnapshot: text('source_ids_snapshot').notNull(),
    confidence: real('confidence').notNull(),
    completeness: real('completeness').notNull(),
    estimated: integer('estimated', { mode: 'boolean' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.intakeRevisionId, table.nutrientCode] }),
    index('nutrition_intake_nutrient_code_idx').on(table.nutrientCode),
  ],
);
