# Kitchen decision assistance and store maps

## Using the features

Open `/assist`, or use the suggestion link from Pantry, Lists, Recipes, Planner or Nutrition. Select the task and relevant recipe/list, then review suggestions. Pantry-dependent features require Pantry stock sharing in Settings → AI. Personal context uses the existing per-profile sharing controls.

Implemented review tasks:

- Shopping aisle classification for unresolved items, preserving existing aisle assignments and remembered rules.
- Pantry-input product matching and recipe ingredient mapping.
- Pantry freshness and restock review priorities, using recorded quantities, storage and dates.
- Nutrition reference selection from retrieved food-data records. The existing calculator remains responsible for nutrient arithmetic; AI probabilities are never calorie values.
- Meal suitability ranking using supplied preferences, actual recipe nutrition and permitted pantry context.
- Nutrition insight prioritization using existing coverage-qualified recommendations and feedback.
- Shopping duplicate review, recipe quality/imported-recipe review, substitutions, targeted clarification, and nutrition-data cleanup priorities.

Suggestions are review tools. Aisle assignments and ingredient mappings have an explicit **Apply reviewed match** action. Other results link to their source editors. Nothing automatically merges shopping quantities, discards pantry stock, replaces a diet goal, or changes a meal plan. Review pages are paginated at 20 candidates. Recipe review uses up to 100 recent saved recipes; product matching considers up to 200 active products, and nutrition reference matching uses up to 20 retrieved results.

A paid-request checkbox explicitly authorizes a new request from the application. Leaving it unchecked returns available saved results. No scheduled paid Decisions calls were added. Decisions uses `gpt-6-luna`, the currently supported model; disabling Chat in household AI settings disables the suggestion service. Existing model customizations continue to apply to other workloads.

## Corrections, evidence and cache

Migration 0061 adds decision records and append-only feedback events. Records are scoped by authenticated account **and** active profile; a profile cookie alone grants no access. Endpoints require authenticated sessions, AI capability and exact trusted mutation origins. API keys cannot access these session-only endpoints.

The cache key includes task version, model, permitted evidence, candidate choices and sharing policy. Changed evidence invalidates an uncorrected result. Normal results last 24 hours; unknown results last one hour; extracted maps last 30 days. Explicit user corrections and dismissals survive TTL expiry and model changes until reset. Each feedback update uses an optimistic version check. Applied matches are stored through the existing manual mapping services, which take precedence over later suggestions.

The UI shows current permitted evidence, source identifiers, the original decision timestamp, cached status and model confidence. Original evidence and candidate choices remain in the stored decision record; feedback events preserve corrections. Evidence is labelled as input considered, not an invented model explanation. Refusals, missing/invalid choices and insufficient evidence become explicit unknown outcomes. No confidence threshold authorizes automatic mutations. Applying a suggestion checks a digest of the evidence shown against freshly loaded source data.

Requests are coalesced in-process and capped at 20 decisions per review page, with a per-account hourly record limit. This is a single-process concurrency guard, not a distributed worker lock. Provider failures retain existing application data and are not represented as successful suggestions.

## Store maps

In Settings → Lists, open **Build a route from a store map** in a supermarket editor. Upload PNG/JPEG/WebP up to 6 MB. The server decodes and normalizes the image with a 25-million-pixel limit, strips metadata, and bounds its dimensions before analysis. Raw image bytes are not retained in the database; an image digest, extracted labels, normalized coordinates, entrance evidence and reviewed route are saved.

Responses structured output extracts department labels and entrances. Instructions explicitly recognize paired up/down arrows as possible entrance/exit symbols. Decisions selects among the extracted entrances using the requested grocery start, or returns unknown. Users can choose an entrance, correct names and reorder departments before importing. The normal store Save action applies the edited route. Merely uploading a new map never overwrites a saved store route.

The default grocery prefix is:

Fresh produce → Bakery → Frozen → Meat & seafood → Grocery → Deli → Snacks & beverages → Dairy → Alcohol.

A Walmart preset also follows the full department sequence supplied by the user. **Use your Walmart order without AI** inserts that supplied sequence directly, including both Hardware stops, with no provider call. Repeated physical department labels receive separate area names to satisfy store section uniqueness. Additional repeated areas detected in a map are preserved rather than silently discarded.

Map-based routes are department-order drafts, not verified shortest paths or turn-by-turn navigation. The image-derived sequence is used after the selected prefix; unresolved remaining stops use proximity as a draft. Entrances and uncertain labels require user review. Checkout and service icons are not classified as shopping departments.

## API routes

- `GET /api/v1/ai/decisions`: permitted recipe/list/store selections.
- `POST /api/v1/ai/decisions`: task, optional query/recipeId/listId/storeId, offset, allowPaidCall.
- `PATCH /api/v1/ai/decisions`: id, version, action (`correct`, `dismiss`, `reset`, `apply`), choice, optional note; `apply` requires evidenceHash.
- `POST /api/v1/ai/store-map`: imageBase64, mimeType, preset, notes, allowPaidCall.
- `PATCH /api/v1/ai/store-map`: id, version, entranceId, order, labels.

The Decisions adapter calls the documented server endpoint directly, so it does not require upgrading the existing OpenAI SDK. Store-map extraction uses the existing Responses SDK.

References: [Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [Create a decision](https://developers.openai.com/api/reference/resources/decisions/methods/create).

## Contextual reviews and chat actions

Kitchen reviews live inside the relevant workspace: ingredient matching and nutrition gaps on recipe details, stock/restocking checks in Pantry, product matching within manual intake, aisle/duplicate review in a list's planning view, evidence prioritization beside nutrition recommendations, and meal comparisons in the planner rail. Library maintenance reviews saved recipes in batches. The full `/assist` workspace remains available.

Reviewed ingredient/aisle matches can be selected and applied together. Each application rechecks current evidence and retains corrections. Partial failures are reported individually. Applying a pantry-input match fills the existing-product field; the user still reviews quantity and storage before saving.

Chat exposes `review_kitchen_data` for all 13 decision tasks and `read_review_workspace` for permitted IDs. Additional paid suggestion requests require the chat checkbox; the model cannot grant itself permission. Suggestions render the same evidence and correction controls as page reviews.

`list_app_actions`, `read_app_data`, and `prepare_app_actions` cover the allowlisted core operations in `ai-app-operation-catalog.ts` (recipes, pantry, lists, plans, stores, collections and tags). Discover an operation's schema before proposing it. Proposals hold up to 20 independent operations, expire after 30 minutes, and are scoped to the authenticated account/profile. Users see the affected records and values before confirming. Pending/completed proposals are restored with the conversation.

Confirmation invokes existing route handlers, retaining HTTP validation, permissions, trusted origins and actor handling. Source snapshots are checked before writes where a corresponding read exists. Optimistic versions required by a route remain required. A proposal is locked before execution; interrupted/partial batches cannot replay on a second click. Processing stops at the first failed action and reports skipped actions. These batches are not atomic across routes.

The generic catalog deliberately excludes credentials, account security, backup operations, file uploads, binary exports, external shopping checkout and provider-generating endpoints. Existing specialized chat tools still handle recipe generation, personal nutrition logging and meal-plan generation. Store map image upload remains in store settings; chat can prepare store/aisle changes using known route data. Generic core reads require all five relevant sharing switches because core records can contain linked household data; contextual decision tools retain their narrower sharing rules.

Validation for this refinement: TypeScript and ESLint only. No automated tests, browser verification or paid provider calls were performed.
