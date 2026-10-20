import 'server-only';
import { cookSessionStartSchema } from '@/lib/domain/cooking';
import { pantryCookConfirmationSchema } from '@/lib/domain/pantry-grocery-cooking';
import {
  manualConsumptionRequestSchema,
  productConsumptionRequestSchema,
  deleteIntakeRequestSchema,
} from '@/lib/domain/nutrition-food-diary';
import { recipeConsumptionRequestSchema } from '@/lib/domain/nutrition-recipe-calculation';
import {
  createPreparedRecipeSchema,
  recordPreparedAllocationSchema,
  confirmPreparedConsumptionSchema,
} from '@/lib/domain/nutrition-prepared-consumption';
import { nutritionDiaryCommandSchema } from '@/lib/domain/nutrition-diary-lifecycle';
import { kitchenContextPatchSchema } from '@/lib/domain/profile-goals';
import {
  foodSearchInputSchema,
  barcodeLookupInputSchema,
  foodDetailsInputSchema,
  foodCatalogImportInputSchema,
  foodCatalogShoppingInputSchema,
} from '@/lib/domain/food-data';
import {
  catalogMeasuresInputSchema,
  storageGuidanceInputSchema,
  catalogEnrichmentInputSchema,
  storeSearchSchema,
  storeLinkInputSchema,
} from '@/lib/domain/bord-catalog';
import { z } from 'zod';
import { shoppingListManageSchema, shoppingListReorderSchema } from '@/lib/domain/planning';
import { createTagSchema as validator0 } from '@/lib/domain/tag';
import { updateTagSchema as validator1 } from '@/lib/domain/tag';
import { tagNameSchema as validator2 } from '@/lib/domain/tag';
import { collectionInputSchema as validator3 } from '@/lib/domain/collection';
import { collectionOrderSchema as validator4 } from '@/lib/domain/collection';
import { collectionInputSchema as validator5 } from '@/lib/domain/collection';
import { collectionRecipeSchema as validator6 } from '@/lib/domain/collection';
import { collectionRecipesSchema as validator7 } from '@/lib/domain/collection';
import { bulkExportQuerySchema as validator8 } from '@/lib/domain/auth';
import { recipeLibraryQuerySchema as validator9 } from '@/lib/domain/recipe';
import { recipeInputSchema as validator10 } from '@/lib/domain/recipe';
import { recipeUpdateInputSchema as validator11 } from '@/lib/domain/recipe';
import { bulkExportQuerySchema as validator12 } from '@/lib/domain/auth';
import { recipeTagsUpdateSchema as validator13 } from '@/lib/domain/recipe';
import { recipePreferenceInputSchema as validator15 } from '@/lib/domain/recipe';
import { recipeReactionInputSchema as validator16 } from '@/lib/domain/recipe';
import { recipeRevisionRestoreInputSchema as validator17 } from '@/lib/domain/recipe';
import { recipeStatusSchema as validator18 } from '@/lib/domain/recipe';
import { isoDateSchema as validator19 } from '@/lib/domain/planning';
import { mealPlanEntrySchema as validator20 } from '@/lib/domain/planning';
import {
  mealPlanEntryUpdateSchema,
  mealPlanStatusUpdateSchema as validator21,
} from '@/lib/domain/planning';
import { bulkExportQuerySchema as validator22 } from '@/lib/domain/auth';
import { swapMealPlanEntriesSchema as validator23 } from '@/lib/domain/planning';
import { duplicateWeekSchema as validator24 } from '@/lib/domain/planning';
import { shoppingListRequestSchema as validator25 } from '@/lib/domain/planning';
import { supermarketProfileInputSchema as validator26 } from '@/lib/domain/list-settings';
import { supermarketProfileUpdateSchema as validator27 } from '@/lib/domain/list-settings';
import { pantryShortageGenerationSchema as validator28 } from '@/lib/domain/pantry-grocery-cooking';
import { shoppingListItemSchema as validator30 } from '@/lib/domain/planning';
import { shoppingListSupermarketSchema as validator31 } from '@/lib/domain/list-settings';
import { shoppingListRetryStoreSchema as validator32 } from '@/lib/domain/planning';
import { shoppingListItemSchema as validator33 } from '@/lib/domain/planning';
import { bulkExportQuerySchema as validator34 } from '@/lib/domain/auth';
import { pantryPurchaseIntakeSchema as validator35 } from '@/lib/domain/pantry-grocery-cooking';
import { pantryShoppingControlSchema as validator36 } from '@/lib/domain/pantry-grocery-cooking';
import { pantryShoppingMatchSchema as validator37 } from '@/lib/domain/pantry-grocery-cooking';
import { pantryShoppingControlSchema as validator38 } from '@/lib/domain/pantry-grocery-cooking';
import { shoppingAisleSchema as validator39 } from '@/lib/domain/planning';
import { shoppingAisleOrderSchema as validator40 } from '@/lib/domain/planning';
import { pantryQuerySchema as validator41 } from '@/lib/domain/pantry';
import { pantryProductInputSchema as validator42 } from '@/lib/domain/pantry';
import { pantryProductUpdateSchema as validator43 } from '@/lib/domain/pantry';
import { pantryLocationInputSchema as validator44 } from '@/lib/domain/pantry';
import { pantryLocationInputSchema as validator45 } from '@/lib/domain/pantry';
import { pantryQuerySchema as validator46 } from '@/lib/domain/pantry';
import { pantryBatchInputSchema as validator47 } from '@/lib/domain/pantry';
import { pantryBatchUpdateSchema as validator48 } from '@/lib/domain/pantry';
import { pantryBatchActionSchema as validator49 } from '@/lib/domain/pantry';
import { bulkExportQuerySchema as validator50 } from '@/lib/domain/auth';
import { pantryBatchActionSchema as validator51 } from '@/lib/domain/pantry';
import { pantryEventQuerySchema as validator52 } from '@/lib/domain/pantry';
import { pantryMappingInputSchema as validator53 } from '@/lib/domain/pantry-availability';
import { mealPlanBatchSchema as validator54 } from '@/lib/domain/planning';
export type AppOperation = {
  id: string;
  path: string;
  method: string;
  summary: string;
  parameters: unknown[];
  body: unknown;
  validator?: z.ZodType;
  effect: 'read' | 'write' | 'paid';
};
export const APP_OPERATIONS: AppOperation[] = [
  {
    id: 'readCookHistory',
    path: '/cook-sessions',
    method: 'GET',
    effect: 'read',
    summary: 'Read the signed-in cooking history and acknowledged serving counts.',
    parameters: [],
    body: null,
  },
  {
    id: 'startReviewedCookSession',
    path: '/cook-sessions',
    method: 'POST',
    effect: 'write',
    summary:
      'Start a reviewed cooking session with the exact recipe and serving count. Does not record eating or deduct stock.',
    parameters: [],
    body: null,
    validator: cookSessionStartSchema
      .extend({ mealPlanEntryId: z.string().uuid().optional() })
      .strict(),
  },
  {
    id: 'readCookPantryPreview',
    path: '/cook-sessions/{sessionId}/pantry',
    method: 'GET',
    effect: 'read',
    summary: 'Review current Pantry deduction evidence for an owned cook session.',
    parameters: [],
    body: null,
  },
  {
    id: 'previewCookProductConsumption',
    path: '/cook-sessions/{sessionId}/pantry',
    method: 'POST',
    effect: 'read',
    summary: 'Preview supported batch allocations without deducting stock.',
    parameters: [],
    body: null,
    validator: z
      .object({
        productId: z.string().uuid(),
        quantity: z.number().positive().max(1000000),
        unit: z.string().trim().min(1).max(30),
      })
      .strict(),
  },
  {
    id: 'confirmCookAndStock',
    path: '/cook-sessions/{sessionId}/complete',
    method: 'POST',
    effect: 'write',
    summary:
      'Explicitly confirm the reviewed cook session, exact stock deductions and leftover quantities. Does not log diary intake.',
    parameters: [],
    body: null,
    validator: pantryCookConfirmationSchema,
  },
  {
    id: 'readHistoricalRetailEvidence',
    path: '/food-data/catalog/retail-evidence',
    method: 'POST',
    effect: 'read',
    summary:
      'Read dated, located retail evidence. A historical listing or price does not establish current branch stock.',
    parameters: [],
    body: null,
    validator: z
      .object({
        productId: z.string().min(1).max(160),
        storeId: z.string().min(1).max(160).optional(),
      })
      .strict(),
  },
  {
    id: 'readCatalogChains',
    path: '/food-data/catalog/chains',
    method: 'POST',
    effect: 'read',
    summary: 'Read known chains by supported country and cursor without linking a store.',
    parameters: [],
    body: null,
    validator: z
      .object({
        country: z.string().length(2).default('US'),
        cursor: z.string().max(2000).optional(),
      })
      .strict(),
  },
  {
    id: 'readNutritionDiaryRevisions',
    path: '/nutrition/profiles/{profileId}/intake',
    method: 'GET',
    effect: 'read',
    summary:
      'Read authorized diary revisions with eaten, corrected, skipped and deleted history explicit. Raw-diary sharing is required.',
    parameters: [],
    body: null,
  },
  {
    id: 'logManualNutrition',
    path: '/nutrition/profiles/{profileId}/intake/manual',
    method: 'POST',
    effect: 'write',
    summary:
      'Log reviewed nutrient totals for the full entered amount. Blank and explicit zero remain distinct.',
    parameters: [],
    body: null,
    validator: manualConsumptionRequestSchema,
  },
  {
    id: 'logProductNutrition',
    path: '/nutrition/profiles/{profileId}/intake/product',
    method: 'POST',
    effect: 'write',
    summary:
      'Log a reviewed saved product quantity using supported frozen conversions. Does not consume Pantry stock.',
    parameters: [],
    body: null,
    validator: productConsumptionRequestSchema,
  },
  {
    id: 'logRecipeNutrition',
    path: '/nutrition/profiles/{profileId}/intake/recipe',
    method: 'POST',
    effect: 'write',
    summary: 'Log the exact recipe calculation with exactly one supported serving or weight basis.',
    parameters: [],
    body: null,
    validator: recipeConsumptionRequestSchema,
  },
  {
    id: 'deleteNutritionDiaryEntry',
    path: '/nutrition/profiles/{profileId}/intake/{revisionId}/delete',
    method: 'POST',
    effect: 'write',
    summary: 'Append a reasoned deletion revision; preserve diary history.',
    parameters: [],
    body: null,
    validator: deleteIntakeRequestSchema,
  },
  {
    id: 'copyMoveNutritionDiary',
    path: '/nutrition/profiles/{profileId}/diary-commands',
    method: 'POST',
    effect: 'write',
    summary:
      'Review explicit source and destination person/date for an additive copy, move, restore or reassignment. Existing domain replay applies.',
    parameters: [],
    body: null,
    validator: nutritionDiaryCommandSchema,
  },
  {
    id: 'readPreparedNutrition',
    path: '/nutrition/profiles/{profileId}/prepared-recipes',
    method: 'GET',
    effect: 'read',
    summary: 'Read authorized prepared snapshots, allocation versions and remaining capacity.',
    parameters: [],
    body: null,
  },
  {
    id: 'prepareRecipeServings',
    path: '/nutrition/profiles/{profileId}/prepared-recipes',
    method: 'POST',
    effect: 'write',
    summary:
      'Record actual preparation against the reviewed calculation and planned meal or completed cook session. Does not record consumption.',
    parameters: [],
    body: null,
    validator: createPreparedRecipeSchema,
  },
  {
    id: 'savePreparedAllocation',
    path: '/nutrition/profiles/{profileId}/prepared-recipes/{preparedId}/allocations',
    method: 'POST',
    effect: 'write',
    summary:
      'Save served, skipped or leftover allocation state with exact predecessor version. Does not record consumption.',
    parameters: [],
    body: null,
    validator: recordPreparedAllocationSchema,
  },
  {
    id: 'confirmPreparedEaten',
    path: '/nutrition/profiles/{profileId}/prepared-recipes/{preparedId}/consume',
    method: 'POST',
    effect: 'write',
    summary:
      'Explicitly confirm eaten for the reviewed person, portion, snapshot and event time with durable command replay.',
    parameters: [],
    body: null,
    validator: confirmPreparedConsumptionSchema,
  },
  {
    id: 'searchCatalogFoods',
    path: '/food-data/searches',
    method: 'POST',
    summary: 'Search available catalog sources without importing food.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: foodSearchInputSchema,
  },
  {
    id: 'lookupCatalogBarcode',
    path: '/food-data/barcode-lookups',
    method: 'POST',
    summary:
      'Resolve a checksum-valid barcode, including source-specific alternatives. No stock or purchase changes.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: barcodeLookupInputSchema,
  },
  {
    id: 'readCatalogFood',
    path: '/food-data/details',
    method: 'POST',
    summary: 'Review exact source revision, nutrition basis, attribution and unknown values.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: foodDetailsInputSchema,
  },
  {
    id: 'readCatalogMeasures',
    path: '/food-data/catalog/measures',
    method: 'POST',
    summary:
      'Read revision-bound measures. Mass, volume and count remain distinct; no invented density conversions.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: catalogMeasuresInputSchema,
  },
  {
    id: 'readStorageGuidance',
    path: '/food-data/catalog/storage-guidance',
    method: 'POST',
    summary:
      'Read attributed storage guidance when available; missing guidance is not a safety conclusion.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: storageGuidanceInputSchema,
  },
  {
    id: 'enrichIdentifiedProducts',
    path: '/food-data/catalog/enrichment',
    method: 'POST',
    summary:
      'Read evidence for identified product IDs only; query-only enrichment is not supported.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: catalogEnrichmentInputSchema,
  },
  {
    id: 'searchCatalogStores',
    path: '/food-data/catalog/stores',
    method: 'POST',
    summary:
      'Find stores by chain, area or explicitly supplied proximity, with bounded cursor pages.',
    effect: 'read',
    parameters: [],
    body: null,
    validator: storeSearchSchema,
  },
  {
    id: 'importReviewedCatalogFood',
    path: '/food-data/imports',
    method: 'POST',
    summary:
      'Import an explicitly reviewed exact food revision as a local product. Does not add stock or consumption.',
    effect: 'write',
    parameters: [],
    body: null,
    validator: foodCatalogImportInputSchema,
  },
  {
    id: 'importReviewedPantryStock',
    path: '/pantry/catalog-imports',
    method: 'POST',
    summary:
      'Import a reviewed food snapshot and explicit stock batches. Requires confirmed quantities and storage.',
    effect: 'write',
    parameters: [],
    body: null,
    validator: foodCatalogImportInputSchema
      .extend({
        batches: z
          .array(z.object({ ...validator47.shape, productId: z.never().optional() }))
          .min(1)
          .max(20),
      })
      .strict(),
  },
  {
    id: 'matchReviewedShoppingProduct',
    path: '/shopping-lists/{listId}/catalog-items',
    method: 'POST',
    summary:
      'Import a reviewed product and mark its confirmed amount in the Bòrd cart. This is not a retailer basket, purchase or Pantry intake.',
    effect: 'write',
    parameters: [],
    body: null,
    validator: foodCatalogShoppingInputSchema,
  },
  {
    id: 'linkCatalogStore',
    path: '/supermarket-profiles/{profileId}/catalog-link',
    method: 'PATCH',
    summary:
      'Link an explicitly reviewed official branch while preserving household route corrections.',
    effect: 'write',
    parameters: [],
    body: null,
    validator: storeLinkInputSchema,
  },
  {
    id: 'readMyKitchenContext',
    path: '/account/kitchen-context',
    method: 'GET',
    effect: 'read',
    summary: 'Read your own saved kitchen interview and revision.',
    parameters: [],
    body: null,
  },
  {
    id: 'updateMyKitchenContext',
    path: '/account/kitchen-context',
    method: 'PATCH',
    effect: 'write',
    summary:
      'Save stated kitchen answers only; preserve omitted answers and explicitly name any fields to clear.',
    parameters: [],
    body: null,
    validator: kitchenContextPatchSchema,
  },
  {
    id: 'generateRecipeImage',
    path: '/recipes/{recipeId}/images/generate',
    method: 'POST',
    effect: 'paid',
    summary:
      'Generate a fresh image for an existing recipe. Paid OpenAI action: only prepare when explicitly requested; confirmation is required.',
    parameters: [],
    body: null,
    validator: z.object({ confirm: z.literal(true) }).strict(),
  },
  {
    id: 'listRecentShoppingItems',
    path: '/shopping-lists/recent-items',
    method: 'GET',
    effect: 'read',
    summary: 'Read recent household purchases for buy-again suggestions',
    parameters: [],
    body: null,
  },
  {
    id: 'addShoppingListNamesBulk',
    path: '/shopping-lists/{listId}/items/bulk',
    method: 'POST',
    effect: 'write',
    summary: 'Add up to 100 shopping item names atomically, skipping existing active names',
    parameters: [],
    body: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', minLength: 1, maxLength: 160 },
        },
      },
    },
    validator: z
      .object({ items: z.array(z.string().trim().min(1).max(160)).min(1).max(100) })
      .strict(),
  },
  {
    ...{
      id: 'listTags',
      path: '/tags',
      method: 'GET',
      effect: 'read',
      summary: 'List canonical household tags with usage counts',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createTag',
      path: '/tags',
      method: 'POST',
      effect: 'write',
      summary: 'Create a canonical household tag',
      parameters: [],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 40 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        },
      },
    },
    validator: validator0,
  },
  {
    ...{
      id: 'updateTag',
      path: '/tags/{tagName}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Rename or recolor a tag while preserving recipe associations',
      parameters: [],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 40 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        },
      },
    },
    validator: validator1,
  },
  {
    ...{
      id: 'deleteTag',
      path: '/tags/{tagName}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Remove a tag association from every recipe',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'mergeTag',
      path: '/tags/{tagName}/merge',
      method: 'POST',
      effect: 'write',
      summary: 'Merge a source tag into a target tag',
      parameters: [
        { name: 'tagName', in: 'path', required: true, schema: { type: 'string', maxLength: 40 } },
      ],
      body: {
        type: 'object',
        required: ['targetName'],
        properties: {
          targetName: { type: 'string', minLength: 1, maxLength: 40 },
          targetColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        },
      },
    },
    validator: validator2,
  },
  {
    ...{
      id: 'listCollections',
      path: '/collections',
      method: 'GET',
      effect: 'read',
      summary: 'List manually ordered household collections with optional local-photo covers',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createCollection',
      path: '/collections',
      method: 'POST',
      effect: 'write',
      summary: 'Create a curated household collection',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 128 },
        },
      ],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          coverImageId: {
            oneOf: [
              { type: 'string', format: 'uuid' },
              { type: 'string', maxLength: 0 },
            ],
          },
        },
      },
    },
    validator: validator3,
  },
  {
    ...{
      id: 'reorderCollections',
      path: '/collections/order',
      method: 'POST',
      effect: 'write',
      summary: 'Replace the manual order of all household collections',
      parameters: [],
      body: {
        type: 'object',
        required: ['collectionIds'],
        properties: {
          collectionIds: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    validator: validator4,
  },
  {
    ...{
      id: 'getCollection',
      path: '/collections/{collectionId}',
      method: 'GET',
      effect: 'read',
      summary: 'Read one collection with its ordered recipes and selectable saved-photo covers',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'updateCollection',
      path: '/collections/{collectionId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Update collection details or choose a cover from one of its saved recipe photos',
      parameters: [],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          coverImageId: {
            oneOf: [
              { type: 'string', format: 'uuid' },
              { type: 'string', maxLength: 0 },
            ],
          },
        },
      },
    },
    validator: validator5,
  },
  {
    ...{
      id: 'deleteCollection',
      path: '/collections/{collectionId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Remove a collection without deleting any recipe or photo',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'addRecipeToCollection',
      path: '/collections/{collectionId}/recipes',
      method: 'POST',
      effect: 'write',
      summary: 'Add one recipe to the end of a collection if it is not already present',
      parameters: [
        {
          name: 'collectionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: {
        type: 'object',
        required: ['recipeId'],
        properties: { recipeId: { type: 'string', format: 'uuid' } },
      },
    },
    validator: validator6,
  },
  {
    ...{
      id: 'replaceCollectionRecipes',
      path: '/collections/{collectionId}/recipes',
      method: 'PUT',
      effect: 'write',
      summary: 'Replace a collection\u2019s ordered recipe membership',
      parameters: [
        {
          name: 'collectionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: {
        type: 'object',
        required: ['recipeIds'],
        properties: {
          recipeIds: { type: 'array', maxItems: 2000, items: { type: 'string', format: 'uuid' } },
        },
      },
    },
    validator: validator7,
  },
  {
    ...{
      id: 'exportCollectionsBulk',
      path: '/collections/bulk',
      method: 'GET',
      effect: 'read',
      summary: 'Stream a bounded snapshot of all collections and their recipe memberships',
      parameters: [
        {
          name: 'updatedSince',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
      ],
      body: null,
    },
    validator: validator8,
  },
  {
    ...{
      id: 'listRecipes',
      path: '/recipes',
      method: 'GET',
      effect: 'read',
      summary: 'Search a paginated, lifecycle-aware shared recipe library',
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' } },
        { name: 'creator', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'tag', in: 'query', schema: { type: 'string', maxLength: 40 } },
        { name: 'collection', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'category', in: 'query', schema: { type: 'string', maxLength: 80 } },
        { name: 'cuisine', in: 'query', schema: { type: 'string', maxLength: 80 } },
        {
          name: 'maxTotalMinutes',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 30240 },
        },
        { name: 'favorite', in: 'query', schema: { type: 'boolean' } },
        { name: 'cooked', in: 'query', schema: { type: 'boolean' } },
        {
          name: 'status',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['active', 'archived', 'trash', 'all'],
            default: 'active',
          },
        },
        {
          name: 'sort',
          in: 'query',
          schema: {
            type: 'string',
            enum: [
              'recently-added',
              'recently-updated',
              'alphabetical',
              'most-recently-cooked',
              'shortest-time',
            ],
          },
        },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      ],
      body: null,
    },
    validator: validator9,
  },
  {
    ...{
      id: 'createRecipe',
      path: '/recipes',
      method: 'POST',
      effect: 'write',
      summary: 'Create a structured recipe and first revision',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 128 },
        },
      ],
      body: {
        type: 'object',
        required: [
          'title',
          'servings',
          'prepMinutes',
          'cookMinutes',
          'tags',
          'ingredientGroups',
          'instructionSections',
        ],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 },
          summary: { type: 'string', maxLength: 800 },
          status: { type: 'string', enum: ['active', 'archived', 'trash'], default: 'active' },
          servings: { type: 'string', minLength: 1, maxLength: 80 },
          prepMinutes: { type: 'integer', minimum: 0 },
          cookMinutes: { type: 'integer', minimum: 0 },
          restMinutes: { type: 'integer', minimum: 0, default: 0 },
          difficulty: { type: 'string', maxLength: 40 },
          cuisine: { type: 'string', maxLength: 80 },
          category: { type: 'string', maxLength: 80 },
          tips: { type: 'string', maxLength: 2000 },
          sharedNotes: { type: 'string', maxLength: 2000 },
          sourceName: { type: 'string' },
          sourceUrl: { type: 'string', format: 'uri' },
          originalAuthor: { type: 'string', maxLength: 160 },
          cookingMethod: { type: 'string', maxLength: 80 },
          equipment: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 120 } },
          nutritionCalories: { type: 'number', minimum: 0 },
          nutritionProteinGrams: { type: 'number', minimum: 0 },
          nutritionCarbohydrateGrams: { type: 'number', minimum: 0 },
          nutritionFatGrams: { type: 'number', minimum: 0 },
          nutritionSaturatedFatGrams: { type: 'number', minimum: 0 },
          nutritionFiberGrams: { type: 'number', minimum: 0 },
          nutritionSugarGrams: { type: 'number', minimum: 0 },
          nutritionSodiumMilligrams: { type: 'number', minimum: 0 },
          tags: { type: 'array', items: { type: 'string' } },
          ingredientGroups: { type: 'array', items: { type: 'object' } },
          instructionSections: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    validator: validator10,
  },
  {
    ...{
      id: 'getRecipe',
      path: '/recipes/{recipeId}',
      method: 'GET',
      effect: 'read',
      summary: 'Read a structured recipe card and revision metadata',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'updateRecipe',
      path: '/recipes/{recipeId}',
      method: 'PUT',
      effect: 'write',
      summary:
        'Replace the current recipe card and append a revision when its expected revision matches',
      parameters: [],
      body: {
        allOf: [
          {
            type: 'object',
            required: [
              'title',
              'servings',
              'prepMinutes',
              'cookMinutes',
              'tags',
              'ingredientGroups',
              'instructionSections',
            ],
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 160 },
              summary: { type: 'string', maxLength: 800 },
              status: { type: 'string', enum: ['active', 'archived', 'trash'], default: 'active' },
              servings: { type: 'string', minLength: 1, maxLength: 80 },
              prepMinutes: { type: 'integer', minimum: 0 },
              cookMinutes: { type: 'integer', minimum: 0 },
              restMinutes: { type: 'integer', minimum: 0, default: 0 },
              difficulty: { type: 'string', maxLength: 40 },
              cuisine: { type: 'string', maxLength: 80 },
              category: { type: 'string', maxLength: 80 },
              tips: { type: 'string', maxLength: 2000 },
              sharedNotes: { type: 'string', maxLength: 2000 },
              sourceName: { type: 'string' },
              sourceUrl: { type: 'string', format: 'uri' },
              originalAuthor: { type: 'string', maxLength: 160 },
              cookingMethod: { type: 'string', maxLength: 80 },
              equipment: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 120 } },
              nutritionCalories: { type: 'number', minimum: 0 },
              nutritionProteinGrams: { type: 'number', minimum: 0 },
              nutritionCarbohydrateGrams: { type: 'number', minimum: 0 },
              nutritionFatGrams: { type: 'number', minimum: 0 },
              nutritionSaturatedFatGrams: { type: 'number', minimum: 0 },
              nutritionFiberGrams: { type: 'number', minimum: 0 },
              nutritionSugarGrams: { type: 'number', minimum: 0 },
              nutritionSodiumMilligrams: { type: 'number', minimum: 0 },
              tags: { type: 'array', items: { type: 'string' } },
              ingredientGroups: { type: 'array', items: { type: 'object' } },
              instructionSections: { type: 'array', items: { type: 'object' } },
            },
          },
          {
            type: 'object',
            required: ['expectedRevision'],
            properties: { expectedRevision: { type: 'integer', minimum: 1 } },
          },
        ],
      },
    },
    validator: validator11,
  },
  {
    ...{
      id: 'trashRecipe',
      path: '/recipes/{recipeId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Move a recipe to trash while preserving its revision history',
      parameters: [
        {
          name: 'expectedRevision',
          in: 'query',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      body: null,
    },
  },
  {
    ...{
      id: 'exportRecipesBulk',
      path: '/recipes/bulk',
      method: 'GET',
      effect: 'read',
      summary: 'Stream a bounded snapshot of complete recipes',
      parameters: [
        {
          name: 'updatedSince',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
        {
          name: 'includeInactive',
          in: 'query',
          required: false,
          schema: { type: 'boolean', default: false },
        },
      ],
      body: null,
    },
    validator: validator12,
  },
  {
    ...{
      id: 'updateRecipeTags',
      path: '/recipes/{recipeId}/tags',
      method: 'PATCH',
      effect: 'write',
      summary: "Replace a recipe's tags and append a revision when its expected revision matches",
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['tags', 'expectedRevision'],
        properties: {
          tags: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 40 },
          },
          expectedRevision: { type: 'integer', minimum: 1 },
        },
      },
    },
    validator: validator13,
  },
  {
    ...{
      id: 'setRecipePreference',
      path: '/recipes/{recipeId}/preference',
      method: 'PUT',
      effect: 'write',
      summary:
        'Save the active profile\u2019s private rating and note without changing the shared recipe revision',
      parameters: [],
      body: {
        type: 'object',
        properties: {
          rating: { oneOf: [{ type: 'integer', minimum: 1, maximum: 5 }, { type: 'null' }] },
          note: { type: 'string', maxLength: 2000 },
        },
      },
    },
    validator: validator15,
  },
  {
    ...{
      id: 'setRecipeReaction',
      path: '/recipes/{recipeId}/preference',
      method: 'PATCH',
      effect: 'write',
      summary:
        'Set or clear the active profile\u2019s dislike, like, or staple score while preserving its note',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['score'],
        properties: { score: { oneOf: [{ type: 'integer', enum: [1, 3, 5] }, { type: 'null' }] } },
      },
    },
    validator: validator16,
  },
  {
    ...{
      id: 'restoreRecipeRevision',
      path: '/recipes/{recipeId}/revisions/{revision}/restore',
      method: 'POST',
      effect: 'write',
      summary: 'Restore a saved shared recipe snapshot by appending a new revision',
      parameters: [],
      body: {
        type: 'object',
        required: ['expectedRevision'],
        properties: { expectedRevision: { type: 'integer', minimum: 1 } },
      },
    },
    validator: validator17,
  },
  {
    ...{
      id: 'duplicateRecipe',
      path: '/recipes/{recipeId}/duplicate',
      method: 'POST',
      effect: 'write',
      summary: 'Create an active editable copy of a current recipe',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'updateRecipeStatus',
      path: '/recipes/{recipeId}/status',
      method: 'PATCH',
      effect: 'write',
      summary: 'Update a recipe lifecycle state with revision protection',
      parameters: [],
      body: {
        type: 'object',
        required: ['status', 'expectedRevision'],
        properties: {
          status: { type: 'string', enum: ['active', 'archived', 'trash'] },
          expectedRevision: { type: 'integer', minimum: 1 },
        },
      },
    },
    validator: validator18,
  },
  {
    ...{
      id: 'listMealPlan',
      path: '/meal-plan',
      method: 'GET',
      effect: 'read',
      summary: 'Read planned meals for an inclusive date range',
      parameters: [],
      body: null,
    },
    validator: validator19,
  },
  {
    ...{
      id: 'addMealPlanEntry',
      path: '/meal-plan',
      method: 'POST',
      effect: 'write',
      summary: 'Add an existing recipe to a date and meal',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 128 },
        },
      ],
      body: null,
    },
    validator: validator20,
  },
  {
    ...{
      id: 'getMealPlanEntry',
      path: '/meal-plan/{entryId}',
      method: 'GET',
      effect: 'read',
      summary: 'Read one planned meal',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'deleteMealPlanEntry',
      path: '/meal-plan/{entryId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Remove one planned recipe or free-form meal',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'updateMealPlanEntry',
      path: '/meal-plan/{entryId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Update a planned meal or mark it planned, skipped, or cancelled',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: { status: { type: 'string', enum: ['planned', 'skipped', 'cancelled'] } },
      },
    },
    validator: z.union([mealPlanEntryUpdateSchema, validator21]),
  },
  {
    ...{
      id: 'exportMealPlanBulk',
      path: '/meal-plan/bulk',
      method: 'GET',
      effect: 'read',
      summary: 'Stream a bounded snapshot of all planned meals',
      parameters: [
        {
          name: 'updatedSince',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
      ],
      body: null,
    },
    validator: validator22,
  },
  {
    ...{
      id: 'swapMealPlanEntries',
      path: '/meal-plan/swap',
      method: 'POST',
      effect: 'write',
      summary: 'Atomically swap two current planned-meal slots',
      parameters: [],
      body: null,
    },
    validator: validator23,
  },
  {
    ...{
      id: 'duplicateMealPlanWeek',
      path: '/meal-plan/duplicate',
      method: 'POST',
      effect: 'write',
      summary: 'Copy one planned week into a destination week',
      parameters: [],
      body: null,
    },
    validator: validator24,
  },
  {
    ...{
      id: 'listShoppingLists',
      path: '/shopping-lists',
      method: 'GET',
      effect: 'read',
      summary: 'List previously generated editable shopping lists',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createOrGenerateShoppingList',
      path: '/shopping-lists',
      method: 'POST',
      effect: 'write',
      summary: 'Create a manual list or generate a Pantry-aware list from a plan week',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 128 },
        },
      ],
      body: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'name'],
            properties: {
              kind: { type: 'string', const: 'manual' },
              name: { type: 'string', minLength: 1, maxLength: 120 },
              makeAutomaticRestockTarget: { type: 'boolean', default: false },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'weekStart', 'weekEnd'],
            properties: {
              kind: { type: 'string', const: 'planner' },
              weekStart: { type: 'string', format: 'date' },
              weekEnd: { type: 'string', format: 'date' },
              sourceMode: {
                type: 'string',
                enum: ['pantry_missing', 'pantry_all'],
                default: 'pantry_all',
              },
              makeAutomaticRestockTarget: { type: 'boolean', default: false },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['weekStart', 'weekEnd'],
            properties: {
              weekStart: { type: 'string', format: 'date' },
              weekEnd: { type: 'string', format: 'date' },
            },
          },
        ],
      },
    },
    validator: validator25,
  },
  {
    ...{
      id: 'listSupermarketProfiles',
      path: '/supermarket-profiles',
      method: 'GET',
      effect: 'read',
      summary: 'Read active and archived supermarket profiles with ordered route sections',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createSupermarketProfile',
      path: '/supermarket-profiles',
      method: 'POST',
      effect: 'write',
      summary: 'Create a supermarket profile and ordered in-store route',
      parameters: [],
      body: null,
    },
    validator: validator26,
  },
  {
    ...{
      id: 'updateSupermarketProfile',
      path: '/supermarket-profiles/{profileId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Replace, archive, or restore a supermarket and its ordered route',
      parameters: [],
      body: null,
    },
    validator: validator27,
  },
  {
    ...{
      id: 'duplicateSupermarketProfile',
      path: '/supermarket-profiles/{profileId}/duplicate',
      method: 'POST',
      effect: 'write',
      summary: 'Copy one supermarket route and its learned item assignments',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'generatePantryShortageList',
      path: '/shopping-lists/pantry-shortages',
      method: 'POST',
      effect: 'write',
      summary: 'Create or regenerate Pantry shortages without overwriting manual edits',
      parameters: [],
      body: {
        type: 'object',
        required: ['weekStart', 'weekEnd'],
        properties: {
          weekStart: { type: 'string', format: 'date' },
          weekEnd: { type: 'string', format: 'date' },
          listId: { type: 'string', format: 'uuid' },
          mode: { type: 'string', enum: ['missing', 'all'], default: 'missing' },
        },
      },
    },
    validator: validator28,
  },
  {
    ...{
      id: 'getShoppingList',
      path: '/shopping-lists/{listId}',
      method: 'GET',
      effect: 'read',
      summary: 'Read an editable list with household aisle definitions in saved order',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'reorderShoppingListItems',
      path: '/shopping-lists/{listId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Reorder, rename, archive, complete, restore, or designate a shopping list',
      parameters: [],
      body: {
        oneOf: [
          {
            type: 'object',
            required: ['itemIds'],
            properties: { itemIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
          },
          {
            type: 'object',
            required: ['action'],
            properties: {
              action: {
                type: 'string',
                enum: [
                  'rename',
                  'archive',
                  'restore',
                  'duplicate',
                  'set_restock_target',
                  'set_notes',
                  'complete',
                ],
              },
              name: { type: 'string', minLength: 1, maxLength: 120 },
              note: { type: 'string', maxLength: 2000 },
              expectedVersion: {
                type: 'integer',
                minimum: 0,
                description: 'Required with set_notes; read notesVersion from the list first.',
              },
            },
          },
        ],
      },
    },
    validator: z.union([shoppingListManageSchema, shoppingListReorderSchema]),
  },
  {
    ...{
      id: 'deleteShoppingList',
      path: '/shopping-lists/{listId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Delete a shopping list unless Pantry history requires retaining it',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'addShoppingListItem',
      path: '/shopping-lists/{listId}/items',
      method: 'POST',
      effect: 'write',
      summary: 'Add a bounded manual item with an optional household aisle assignment',
      parameters: [],
      body: null,
    },
    validator: validator30,
  },
  {
    ...{
      id: 'setShoppingListSupermarket',
      path: '/shopping-lists/{listId}/supermarket-profile',
      method: 'PATCH',
      effect: 'write',
      summary: "Switch a list's supermarket and deterministically reclassify every item",
      parameters: [],
      body: null,
    },
    validator: validator31,
  },
  {
    ...{
      id: 'retryShoppingListAtStore',
      path: '/shopping-lists/{listId}/retry-store',
      method: 'POST',
      effect: 'write',
      summary: 'Create a new list for unavailable items using another supermarket route',
      parameters: [],
      body: null,
    },
    validator: validator32,
  },
  {
    ...{
      id: 'updateShoppingListItem',
      path: '/shopping-lists/{listId}/items/{itemId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Edit, check, or reassign one shopping-list item',
      parameters: [],
      body: null,
    },
    validator: validator33,
  },
  {
    ...{
      id: 'deleteShoppingListItem',
      path: '/shopping-lists/{listId}/items/{itemId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Remove one shopping-list item',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'exportShoppingListsBulk',
      path: '/shopping-lists/bulk',
      method: 'GET',
      effect: 'read',
      summary: 'Stream a bounded snapshot of shopping lists with their items',
      parameters: [
        {
          name: 'updatedSince',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
        {
          name: 'includeInactive',
          in: 'query',
          required: false,
          schema: { type: 'boolean', default: false },
        },
      ],
      body: null,
    },
    validator: validator34,
  },
  {
    ...{
      id: 'intakePurchasedShoppingItem',
      path: '/shopping-lists/{listId}/items/{itemId}/pantry-intake',
      method: 'POST',
      effect: 'write',
      summary: 'Add one retry-stable purchase operation to an explicit Pantry location',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['operationKey', 'productId', 'locationId', 'quantity', 'unit'],
        properties: {
          operationKey: { type: 'string', minLength: 8, maxLength: 160 },
          productId: { type: 'string', format: 'uuid' },
          locationId: { type: 'string', format: 'uuid' },
          quantity: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
          unit: { type: 'string', minLength: 1, maxLength: 30 },
          intakeMode: { type: 'string', enum: ['partial', 'complete'], default: 'partial' },
          packageCount: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
          amountPerPackage: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
          packageUnit: { type: 'string', maxLength: 30 },
          sublocation: { type: 'string', maxLength: 120 },
          purchaseDate: { type: 'string', format: 'date' },
          bestBeforeDate: { type: 'string', format: 'date' },
          useByDate: { type: 'string', format: 'date' },
          sellByDate: { type: 'string', format: 'date' },
          openedDate: { type: 'string', format: 'date' },
          frozenDate: { type: 'string', format: 'date' },
          thawedDate: { type: 'string', format: 'date' },
          preparedDate: { type: 'string', format: 'date' },
          expiryPrecision: {
            type: 'string',
            enum: ['exact', 'estimated', 'month_only', 'unknown'],
            default: 'unknown',
          },
          purchasePriceCents: { type: 'integer', minimum: 0, maximum: 100000000 },
          store: { type: 'string', maxLength: 120 },
          source: { type: 'string', maxLength: 160 },
          notes: { type: 'string', maxLength: 2000 },
        },
      },
    },
    validator: validator35,
  },
  {
    ...{
      id: 'updateShoppingItemPantryControl',
      path: '/shopping-lists/{listId}/items/{itemId}/pantry-controls',
      method: 'PATCH',
      effect: 'write',
      summary: 'Control Pantry coverage or the recurring policy for this shopping trip',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'covered',
              'ignore',
              'inaccurate',
              'reset',
              'extra',
              'skip_policy',
              'restore_policy',
              'assume_empty_for_trip',
            ],
          },
          quantity: { type: 'number', minimum: 0, maximum: 1000000 },
          unit: { type: 'string', maxLength: 30 },
          note: { type: 'string', maxLength: 500 },
        },
      },
    },
    validator: validator36,
  },
  {
    ...{
      id: 'matchShoppingItemToPantryProduct',
      path: '/shopping-lists/{listId}/items/{itemId}/pantry-match',
      method: 'PATCH',
      effect: 'write',
      summary: 'Persist a generated shopping item match to an existing Pantry product',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['productId', 'matchType'],
        properties: {
          productId: { type: 'string', format: 'uuid' },
          matchType: { type: 'string', enum: ['exact', 'suggested', 'manual'] },
        },
      },
    },
    validator: validator37,
  },
  {
    ...{
      id: 'updateShoppingPolicyForTrip',
      path: '/shopping-lists/{listId}/policies/{productId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Skip, restore, or resolve one recurring product policy for this trip',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['skip_policy', 'restore_policy', 'assume_empty_for_trip'],
          },
        },
      },
    },
    validator: validator38,
  },
  {
    ...{
      id: 'listShoppingAisles',
      path: '/shopping-lists/aisles',
      method: 'GET',
      effect: 'read',
      summary: 'List household store aisles in durable display order',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createShoppingAisle',
      path: '/shopping-lists/aisles',
      method: 'POST',
      effect: 'write',
      summary: 'Create a bounded unique household store aisle',
      parameters: [],
      body: null,
    },
    validator: validator39,
  },
  {
    ...{
      id: 'reorderShoppingAisles',
      path: '/shopping-lists/aisles',
      method: 'PATCH',
      effect: 'write',
      summary: 'Replace the complete current household aisle order',
      parameters: [],
      body: null,
    },
    validator: validator40,
  },
  {
    ...{
      id: 'getPantrySummary',
      path: '/pantry/summary',
      method: 'GET',
      effect: 'read',
      summary: 'Read filtered Pantry inventory and summary totals',
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string', maxLength: 160 } },
        {
          name: 'view',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['all', 'pantry', 'refrigerator', 'freezer', 'low_stock', 'opened', 'recent'],
          },
        },
        {
          name: 'sort',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['name', 'expiry', 'quantity', 'added', 'updated', 'location'],
          },
        },
      ],
      body: null,
    },
    validator: validator41,
  },
  {
    ...{
      id: 'listPantryProducts',
      path: '/pantry/products',
      method: 'GET',
      effect: 'read',
      summary: 'List canonical Pantry products',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createPantryProduct',
      path: '/pantry/products',
      method: 'POST',
      effect: 'write',
      summary: 'Create a canonical Pantry product',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 128 },
        },
      ],
      body: {
        type: 'object',
        required: ['displayName'],
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 160 },
          brand: { type: 'string', maxLength: 120 },
          variant: { type: 'string', maxLength: 120 },
          category: { type: 'string', maxLength: 80 },
          aliases: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 120 } },
          defaultInventoryUnit: { type: 'string', maxLength: 30, default: 'each' },
          defaultStorageType: {
            type: 'string',
            enum: ['pantry', 'refrigerator', 'freezer', 'counter', 'other'],
          },
          isStaple: { type: 'boolean', default: false },
          restockMode: {
            type: 'string',
            enum: ['none', 'always_have', 'always_buy'],
            default: 'none',
          },
          restockTrigger: {
            type: 'string',
            enum: ['below_target', 'reorder_point', 'empty'],
            default: 'below_target',
          },
          targetStock: { type: ['number', 'null'], exclusiveMinimum: 0 },
          reorderThreshold: { type: ['number', 'null'], minimum: 0 },
          preferredPurchaseQuantity: { type: ['number', 'null'], exclusiveMinimum: 0 },
          stockUnit: { type: 'string', maxLength: 30 },
        },
      },
    },
    validator: validator42,
  },
  {
    ...{
      id: 'getPantryProduct',
      path: '/pantry/products/{productId}',
      method: 'GET',
      effect: 'read',
      summary: 'Read one canonical Pantry product',
      parameters: [
        {
          name: 'productId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: null,
    },
  },
  {
    ...{
      id: 'updatePantryProduct',
      path: '/pantry/products/{productId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Replace one canonical Pantry product definition',
      parameters: [
        {
          name: 'productId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: {
        type: 'object',
        required: ['displayName'],
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 160 },
          brand: { type: 'string', maxLength: 120 },
          variant: { type: 'string', maxLength: 120 },
          category: { type: 'string', maxLength: 80 },
          aliases: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 120 } },
          defaultInventoryUnit: { type: 'string', maxLength: 30, default: 'each' },
          defaultStorageType: {
            type: 'string',
            enum: ['pantry', 'refrigerator', 'freezer', 'counter', 'other'],
          },
          isStaple: { type: 'boolean', default: false },
          restockMode: {
            type: 'string',
            enum: ['none', 'always_have', 'always_buy'],
            default: 'none',
          },
          restockTrigger: {
            type: 'string',
            enum: ['below_target', 'reorder_point', 'empty'],
            default: 'below_target',
          },
          targetStock: { type: ['number', 'null'], exclusiveMinimum: 0 },
          reorderThreshold: { type: ['number', 'null'], minimum: 0 },
          preferredPurchaseQuantity: { type: ['number', 'null'], exclusiveMinimum: 0 },
          stockUnit: { type: 'string', maxLength: 30 },
        },
      },
    },
    validator: validator43,
  },
  {
    ...{
      id: 'archivePantryProduct',
      path: '/pantry/products/{productId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Archive a Pantry product after all active stock is resolved',
      parameters: [
        {
          name: 'productId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: null,
    },
  },
  {
    ...{
      id: 'listPantryLocations',
      path: '/pantry/locations',
      method: 'GET',
      effect: 'read',
      summary: 'List the nested Pantry storage tree',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'createPantryLocation',
      path: '/pantry/locations',
      method: 'POST',
      effect: 'write',
      summary: 'Create a Pantry storage location',
      parameters: [],
      body: {
        type: 'object',
        required: ['name', 'storageType'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          parentId: { type: 'string' },
          storageType: {
            type: 'string',
            enum: ['pantry', 'refrigerator', 'freezer', 'counter', 'other'],
          },
          archived: { type: 'boolean', default: false },
        },
      },
    },
    validator: validator44,
  },
  {
    ...{
      id: 'updatePantryLocation',
      path: '/pantry/locations/{locationId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Rename, move, archive, or restore a storage location',
      parameters: [
        {
          name: 'locationId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: {
        type: 'object',
        required: ['name', 'storageType'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          parentId: { type: 'string' },
          storageType: {
            type: 'string',
            enum: ['pantry', 'refrigerator', 'freezer', 'counter', 'other'],
          },
          archived: { type: 'boolean', default: false },
        },
      },
    },
    validator: validator45,
  },
  {
    ...{
      id: 'listPantryBatches',
      path: '/pantry/batches',
      method: 'GET',
      effect: 'read',
      summary: 'List filtered physical Pantry batches',
      parameters: [],
      body: null,
    },
    validator: validator46,
  },
  {
    ...{
      id: 'createPantryBatch',
      path: '/pantry/batches',
      method: 'POST',
      effect: 'write',
      summary: 'Add a physical Pantry batch',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 128 },
        },
      ],
      body: {
        type: 'object',
        required: ['productId', 'locationId'],
        properties: {
          productId: { type: 'string', format: 'uuid' },
          quantityRemaining: { type: ['number', 'null'], minimum: 0 },
          originalQuantity: { type: ['number', 'null'], exclusiveMinimum: 0 },
          unit: { type: 'string', maxLength: 30 },
          approximateState: {
            type: ['string', 'null'],
            enum: ['full', 'three_quarters', 'half', 'quarter', 'almost_empty', 'unknown', null],
          },
          locationId: { type: 'string', format: 'uuid' },
          bestBeforeDate: { type: ['string', 'null'], format: 'date' },
          useByDate: { type: ['string', 'null'], format: 'date' },
          status: {
            type: 'string',
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
          },
          notes: { type: 'string', maxLength: 2000 },
        },
      },
    },
    validator: validator47,
  },
  {
    ...{
      id: 'getPantryBatch',
      path: '/pantry/batches/{batchId}',
      method: 'GET',
      effect: 'read',
      summary: 'Read one physical Pantry batch with product, location, and expiry state',
      parameters: [
        { name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      body: null,
    },
  },
  {
    ...{
      id: 'updatePantryBatch',
      path: '/pantry/batches/{batchId}',
      method: 'PATCH',
      effect: 'write',
      summary: 'Replace version-protected physical batch details',
      parameters: [
        { name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      body: {
        allOf: [
          {
            type: 'object',
            required: ['productId', 'locationId'],
            properties: {
              productId: { type: 'string', format: 'uuid' },
              quantityRemaining: { type: ['number', 'null'], minimum: 0 },
              originalQuantity: { type: ['number', 'null'], exclusiveMinimum: 0 },
              unit: { type: 'string', maxLength: 30 },
              approximateState: {
                type: ['string', 'null'],
                enum: [
                  'full',
                  'three_quarters',
                  'half',
                  'quarter',
                  'almost_empty',
                  'unknown',
                  null,
                ],
              },
              locationId: { type: 'string', format: 'uuid' },
              bestBeforeDate: { type: ['string', 'null'], format: 'date' },
              useByDate: { type: ['string', 'null'], format: 'date' },
              status: {
                type: 'string',
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
              },
              notes: { type: 'string', maxLength: 2000 },
            },
          },
          {
            type: 'object',
            required: ['expectedVersion'],
            properties: { expectedVersion: { type: 'integer', minimum: 1 } },
          },
        ],
      },
    },
    validator: validator48,
  },
  {
    ...{
      id: 'discardPantryBatch',
      path: '/pantry/batches/{batchId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Resolve a Pantry batch as discarded while preserving immutable inventory history',
      parameters: [
        { name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'expectedVersion',
          in: 'query',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      body: null,
    },
    validator: validator49,
  },
  {
    ...{
      id: 'exportPantryBatchesBulk',
      path: '/pantry/batches/bulk',
      method: 'GET',
      effect: 'read',
      summary: 'Stream a bounded snapshot of physical Pantry batches',
      parameters: [
        {
          name: 'updatedSince',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
        {
          name: 'includeInactive',
          in: 'query',
          required: false,
          schema: { type: 'boolean', default: false },
        },
      ],
      body: null,
    },
    validator: validator50,
  },
  {
    ...{
      id: 'applyPantryBatchAction',
      path: '/pantry/batches/{batchId}/actions',
      method: 'POST',
      effect: 'write',
      summary: 'Apply and record one version-protected stock action',
      parameters: [
        { name: 'batchId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      body: {
        type: 'object',
        required: ['type', 'expectedVersion'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'consume',
              'consume_one',
              'mark_empty',
              'open',
              'move',
              'freeze',
              'thaw',
              'correct',
              'discard',
              'donate',
              'restore',
              'split',
              'combine',
              'undo',
            ],
          },
          expectedVersion: { type: 'integer', minimum: 1 },
          quantity: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string', maxLength: 30 },
          locationId: { type: 'string', format: 'uuid' },
          targetBatchId: { type: 'string', format: 'uuid' },
          targetExpectedVersion: { type: 'integer', minimum: 1 },
          reason: { type: 'string', maxLength: 160 },
          note: { type: 'string', maxLength: 500 },
        },
      },
    },
    validator: validator51,
  },
  {
    ...{
      id: 'listPantryEvents',
      path: '/pantry/events',
      method: 'GET',
      effect: 'read',
      summary: 'Read bounded immutable Pantry history',
      parameters: [
        { name: 'batchId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      ],
      body: null,
    },
    validator: validator52,
  },
  {
    ...{
      id: 'setRecipeIngredientPantryMapping',
      path: '/pantry/mappings/{ingredientId}',
      method: 'PUT',
      effect: 'write',
      summary: 'Save an actor-attributed manual Pantry mapping without changing recipe text',
      parameters: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['productId'],
        properties: {
          productId: { type: 'string', format: 'uuid' },
          compatibleVariant: { type: 'boolean', default: false },
          isOptional: { type: 'boolean', default: false },
        },
      },
    },
    validator: validator53,
  },
  {
    ...{
      id: 'removeRecipeIngredientPantryMapping',
      path: '/pantry/mappings/{ingredientId}',
      method: 'DELETE',
      effect: 'write',
      summary: 'Remove a manual Pantry mapping without changing recipe text',
      parameters: [],
      body: null,
    },
  },
  {
    ...{
      id: 'refreshPlannedRecipe',
      path: '/meal-plan/{entryId}/refresh-recipe',
      method: 'POST',
      effect: 'write',
      summary: 'Refresh the recipe snapshot used by a planned meal',
      parameters: [
        { name: 'entryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      body: null,
    },
  },
  {
    ...{
      id: 'createMealPlanBatch',
      path: '/meal-plan/batch',
      method: 'POST',
      effect: 'write',
      summary: 'Add up to 280 planned meals',
      parameters: [],
      body: {
        type: 'object',
        properties: {
          entries: {
            minItems: 1,
            maxItems: 280,
            type: 'array',
            items: {
              type: 'object',
              properties: {
                plannedFor: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                meal: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 48,
                  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
                },
                recipeId: {
                  default: '',
                  anyOf: [
                    { type: 'string', const: '' },
                    {
                      type: 'string',
                      format: 'uuid',
                      pattern:
                        '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',
                    },
                  ],
                },
                title: { default: '', type: 'string', maxLength: 160 },
                servings: { type: 'integer', minimum: 1, maximum: 100 },
                note: { type: 'string', maxLength: 240 },
              },
              required: ['plannedFor', 'meal', 'servings', 'note'],
            },
          },
        },
        required: ['entries'],
      },
    },
    validator: validator54,
  },
  {
    ...{
      id: 'setRecipeFavorite',
      path: '/recipes/{recipeId}/favorite',
      method: 'PUT',
      effect: 'write',
      summary: 'Set the API key owner\u2019s recipe favorite',
      parameters: [
        {
          name: 'recipeId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      body: {
        type: 'object',
        required: ['favorite'],
        properties: { favorite: { type: 'boolean' } },
      },
    },
  },
];
export const APP_ROUTE_LOADERS = {
  readCookHistory: () => import('@/app/api/v1/cook-sessions/route'),
  startReviewedCookSession: () => import('@/app/api/v1/cook-sessions/route'),
  readCookPantryPreview: () => import('@/app/api/v1/cook-sessions/[sessionId]/pantry/route'),
  previewCookProductConsumption: () =>
    import('@/app/api/v1/cook-sessions/[sessionId]/pantry/route'),
  confirmCookAndStock: () => import('@/app/api/v1/cook-sessions/[sessionId]/complete/route'),
  readHistoricalRetailEvidence: () =>
    import('@/app/api/v1/food-data/catalog/retail-evidence/route'),
  readCatalogChains: () => import('@/app/api/v1/food-data/catalog/chains/route'),
  readNutritionDiaryRevisions: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/intake/route'),
  logManualNutrition: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/intake/manual/route'),
  logProductNutrition: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/intake/product/route'),
  logRecipeNutrition: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/intake/recipe/route'),
  deleteNutritionDiaryEntry: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/intake/[revisionId]/delete/route'),
  copyMoveNutritionDiary: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/diary-commands/route'),
  readPreparedNutrition: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/route'),
  prepareRecipeServings: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/route'),
  savePreparedAllocation: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/[preparedId]/allocations/route'),
  confirmPreparedEaten: () =>
    import('@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/[preparedId]/consume/route'),
  searchCatalogFoods: () => import('@/app/api/v1/food-data/searches/route'),
  lookupCatalogBarcode: () => import('@/app/api/v1/food-data/barcode-lookups/route'),
  readCatalogFood: () => import('@/app/api/v1/food-data/details/route'),
  readCatalogMeasures: () => import('@/app/api/v1/food-data/catalog/measures/route'),
  readStorageGuidance: () => import('@/app/api/v1/food-data/catalog/storage-guidance/route'),
  enrichIdentifiedProducts: () => import('@/app/api/v1/food-data/catalog/enrichment/route'),
  searchCatalogStores: () => import('@/app/api/v1/food-data/catalog/stores/route'),
  importReviewedCatalogFood: () => import('@/app/api/v1/food-data/imports/route'),
  importReviewedPantryStock: () => import('@/app/api/v1/pantry/catalog-imports/route'),
  matchReviewedShoppingProduct: () =>
    import('@/app/api/v1/shopping-lists/[listId]/catalog-items/route'),
  linkCatalogStore: () =>
    import('@/app/api/v1/supermarket-profiles/[profileId]/catalog-link/route'),
  readMyKitchenContext: () => import('@/app/api/v1/account/kitchen-context/route'),
  updateMyKitchenContext: () => import('@/app/api/v1/account/kitchen-context/route'),
  generateRecipeImage: () => import('@/app/api/v1/recipes/[recipeId]/images/generate/route'),
  listRecentShoppingItems: () => import('@/app/api/v1/shopping-lists/recent-items/route'),
  addShoppingListNamesBulk: () => import('@/app/api/v1/shopping-lists/[listId]/items/bulk/route'),
  listTags: () => import('@/app/api/v1/tags/route'),
  createTag: () => import('@/app/api/v1/tags/route'),
  updateTag: () => import('@/app/api/v1/tags/[tagName]/route'),
  deleteTag: () => import('@/app/api/v1/tags/[tagName]/route'),
  mergeTag: () => import('@/app/api/v1/tags/[tagName]/merge/route'),
  listCollections: () => import('@/app/api/v1/collections/route'),
  createCollection: () => import('@/app/api/v1/collections/route'),
  reorderCollections: () => import('@/app/api/v1/collections/order/route'),
  getCollection: () => import('@/app/api/v1/collections/[collectionId]/route'),
  updateCollection: () => import('@/app/api/v1/collections/[collectionId]/route'),
  deleteCollection: () => import('@/app/api/v1/collections/[collectionId]/route'),
  addRecipeToCollection: () => import('@/app/api/v1/collections/[collectionId]/recipes/route'),
  replaceCollectionRecipes: () => import('@/app/api/v1/collections/[collectionId]/recipes/route'),
  exportCollectionsBulk: () => import('@/app/api/v1/collections/bulk/route'),
  listRecipes: () => import('@/app/api/v1/recipes/route'),
  createRecipe: () => import('@/app/api/v1/recipes/route'),
  getRecipe: () => import('@/app/api/v1/recipes/[recipeId]/route'),
  updateRecipe: () => import('@/app/api/v1/recipes/[recipeId]/route'),
  trashRecipe: () => import('@/app/api/v1/recipes/[recipeId]/route'),
  exportRecipesBulk: () => import('@/app/api/v1/recipes/bulk/route'),
  updateRecipeTags: () => import('@/app/api/v1/recipes/[recipeId]/tags/route'),
  setRecipePreference: () => import('@/app/api/v1/recipes/[recipeId]/preference/route'),
  setRecipeReaction: () => import('@/app/api/v1/recipes/[recipeId]/preference/route'),
  restoreRecipeRevision: () =>
    import('@/app/api/v1/recipes/[recipeId]/revisions/[revision]/restore/route'),
  duplicateRecipe: () => import('@/app/api/v1/recipes/[recipeId]/duplicate/route'),
  updateRecipeStatus: () => import('@/app/api/v1/recipes/[recipeId]/status/route'),
  listMealPlan: () => import('@/app/api/v1/meal-plan/route'),
  addMealPlanEntry: () => import('@/app/api/v1/meal-plan/route'),
  getMealPlanEntry: () => import('@/app/api/v1/meal-plan/[entryId]/route'),
  deleteMealPlanEntry: () => import('@/app/api/v1/meal-plan/[entryId]/route'),
  updateMealPlanEntry: () => import('@/app/api/v1/meal-plan/[entryId]/route'),
  exportMealPlanBulk: () => import('@/app/api/v1/meal-plan/bulk/route'),
  swapMealPlanEntries: () => import('@/app/api/v1/meal-plan/swap/route'),
  duplicateMealPlanWeek: () => import('@/app/api/v1/meal-plan/duplicate/route'),
  listShoppingLists: () => import('@/app/api/v1/shopping-lists/route'),
  createOrGenerateShoppingList: () => import('@/app/api/v1/shopping-lists/route'),
  listSupermarketProfiles: () => import('@/app/api/v1/supermarket-profiles/route'),
  createSupermarketProfile: () => import('@/app/api/v1/supermarket-profiles/route'),
  updateSupermarketProfile: () => import('@/app/api/v1/supermarket-profiles/[profileId]/route'),
  duplicateSupermarketProfile: () =>
    import('@/app/api/v1/supermarket-profiles/[profileId]/duplicate/route'),
  generatePantryShortageList: () => import('@/app/api/v1/shopping-lists/pantry-shortages/route'),
  getShoppingList: () => import('@/app/api/v1/shopping-lists/[listId]/route'),
  reorderShoppingListItems: () => import('@/app/api/v1/shopping-lists/[listId]/route'),
  deleteShoppingList: () => import('@/app/api/v1/shopping-lists/[listId]/route'),
  addShoppingListItem: () => import('@/app/api/v1/shopping-lists/[listId]/items/route'),
  setShoppingListSupermarket: () =>
    import('@/app/api/v1/shopping-lists/[listId]/supermarket-profile/route'),
  retryShoppingListAtStore: () => import('@/app/api/v1/shopping-lists/[listId]/retry-store/route'),
  updateShoppingListItem: () => import('@/app/api/v1/shopping-lists/[listId]/items/[itemId]/route'),
  deleteShoppingListItem: () => import('@/app/api/v1/shopping-lists/[listId]/items/[itemId]/route'),
  exportShoppingListsBulk: () => import('@/app/api/v1/shopping-lists/bulk/route'),
  intakePurchasedShoppingItem: () =>
    import('@/app/api/v1/shopping-lists/[listId]/items/[itemId]/pantry-intake/route'),
  updateShoppingItemPantryControl: () =>
    import('@/app/api/v1/shopping-lists/[listId]/items/[itemId]/pantry-controls/route'),
  matchShoppingItemToPantryProduct: () =>
    import('@/app/api/v1/shopping-lists/[listId]/items/[itemId]/pantry-match/route'),
  updateShoppingPolicyForTrip: () =>
    import('@/app/api/v1/shopping-lists/[listId]/policies/[productId]/route'),
  listShoppingAisles: () => import('@/app/api/v1/shopping-lists/aisles/route'),
  createShoppingAisle: () => import('@/app/api/v1/shopping-lists/aisles/route'),
  reorderShoppingAisles: () => import('@/app/api/v1/shopping-lists/aisles/route'),
  getPantrySummary: () => import('@/app/api/v1/pantry/summary/route'),
  listPantryProducts: () => import('@/app/api/v1/pantry/products/route'),
  createPantryProduct: () => import('@/app/api/v1/pantry/products/route'),
  getPantryProduct: () => import('@/app/api/v1/pantry/products/[productId]/route'),
  updatePantryProduct: () => import('@/app/api/v1/pantry/products/[productId]/route'),
  archivePantryProduct: () => import('@/app/api/v1/pantry/products/[productId]/route'),
  listPantryLocations: () => import('@/app/api/v1/pantry/locations/route'),
  createPantryLocation: () => import('@/app/api/v1/pantry/locations/route'),
  updatePantryLocation: () => import('@/app/api/v1/pantry/locations/[locationId]/route'),
  listPantryBatches: () => import('@/app/api/v1/pantry/batches/route'),
  createPantryBatch: () => import('@/app/api/v1/pantry/batches/route'),
  getPantryBatch: () => import('@/app/api/v1/pantry/batches/[batchId]/route'),
  updatePantryBatch: () => import('@/app/api/v1/pantry/batches/[batchId]/route'),
  discardPantryBatch: () => import('@/app/api/v1/pantry/batches/[batchId]/route'),
  exportPantryBatchesBulk: () => import('@/app/api/v1/pantry/batches/bulk/route'),
  applyPantryBatchAction: () => import('@/app/api/v1/pantry/batches/[batchId]/actions/route'),
  listPantryEvents: () => import('@/app/api/v1/pantry/events/route'),
  setRecipeIngredientPantryMapping: () =>
    import('@/app/api/v1/pantry/mappings/[ingredientId]/route'),
  removeRecipeIngredientPantryMapping: () =>
    import('@/app/api/v1/pantry/mappings/[ingredientId]/route'),
  refreshPlannedRecipe: () => import('@/app/api/v1/meal-plan/[entryId]/refresh-recipe/route'),
  createMealPlanBatch: () => import('@/app/api/v1/meal-plan/batch/route'),
  setRecipeFavorite: () => import('@/app/api/v1/recipes/[recipeId]/favorite/route'),
};
