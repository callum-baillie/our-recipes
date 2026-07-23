# T036 recipe calculation and intake boundary map

## Evidence map

- `recipes.servings` is free text and `recipes.currentRevision` is the immutable recipe-version key. Ingredient rows contain only `quantity`, `unit`, `item`, and `note` (`src/lib/db/schema.ts`). `parseServingCount` is suitable for display scaling but accepts the first number inside ranges such as `4-6`; calculation code needs a stricter unambiguous-yield parser.
- `recipe_ingredient_product_mappings` supplies one product per ingredient plus `matchType`, `compatibleVariant`, and `isOptional`. It preserves the recipe text and is readable without editing the active Pantry service. Pantry T017 currently owns grocery/cooking services, APIs, UI, tests, and shared docs, but does not own the mapping table, recipe detail page, or Nutrition modules.
- `selectPreferredFoodNutritionRecord` returns an immutable record with its source and values using source priority, then revision and creation time. Records preserve basis (`per_100g`, `per_100ml`, `per_serving`, `per_unit`), serving weight, density, piece weight, confidence, completeness, and supersession. No production API or UI currently lets a user add/correct those records; only integration tests call the service.
- `inventory-units.ts` provides exact count/mass/volume aliases and same-family conversion factors. Its `inventoryBaseQuantity` return unit is not consistently the base unit for mass/volume, so the calculator should use `findInventoryUnit`/`convertInventoryQuantity` or a dedicated pure normalization function and cover kg/L regressions.
- `appendRecipeNutritionCalculation` already enforces recipe existence, non-future recipe revision, deterministic source-digest uniqueness, explicit latest supersession, and atomic contribution/nutrient persistence. Contributions already freeze product record, multiplier, edible/drained/optional/retention factors, confidence, completeness, and a missing reason. Existing calculation identity helpers are create-only, so an idempotent get-or-create seam is required for the built-in calculated source/version.
- `appendNutritionIntakeRevision` already enforces `manage_profile`, append-only corrections, frozen recipe/calculation/version/source-digest provenance, explicit portion basis, and nutrient snapshots. The generic browser API currently accepts complete nutrient/provenance payloads. A dedicated recipe-consumption route must accept only calculation ID, serving/weight portion, time, and meal slot, then load and scale the immutable calculation server-side before calling the service.
- The recipe detail currently renders eight legacy per-serving columns and offers a separately gated paid OpenAI estimate. A new deterministic normalized panel must not present legacy or AI values as the calculated record, and planning/cooking surfaces must remain untouched in this package.

## Supported conversion matrix for the first deterministic calculator

| Ingredient evidence | Food-record basis | Result |
| --- | --- | --- |
| Mass | `per_100g` | Exact same-family conversion to grams, then divide by 100. |
| Volume | `per_100ml` | Exact same-family conversion to milliliters, then divide by 100. |
| Volume | `per_100g` | Supported only with record density; convert ml to grams. |
| Mass | `per_100ml` | Supported only with record density; convert grams to ml. |
| Count | `per_unit` | Supported only for a compatible count basis or with explicit piece-weight evidence for weight-based scaling. |
| Mass/volume | `per_serving` | Supported only through explicit serving-weight evidence; volume also requires density. |
| Count | `per_100g` | Supported only with piece-weight evidence. |
| Unknown/custom unit, missing quantity, missing mapping, or missing food record | Any | No nutrient contribution; persist a specific missing reason and lower completeness. |
| Package/can/bottle/carton crossing to another count family | Any | Unsupported unless exact compatible reference evidence exists; never infer package size. |
| Mass-volume crossing | Any | Unsupported without density. |

All factors must apply configured edible portion, drained yield, optional inclusion, and nutrient-specific retention only when explicit values exist. Absent cooking/yield evidence means a clearly labeled raw-ingredient estimate, not an invented loss factor.

## Recommended non-conflicting Worker boundary

The next Worker can deliver one usable Nutrition-page vertical slice without schema or Pantry T017 edits:

- Add a pure recipe calculator domain module and a server orchestration service that reads recipe ingredients/mappings/preferred immutable food records, creates deterministic calculation identity, appends a calculation, and builds an explicit confirmed-intake snapshot from a selected calculation.
- Add authenticated, exact-origin Nutrition APIs for manual immutable product-record entry/correction, recipe calculation, calculation retrieval, and explicit recipe intake. The browser must never submit calculated nutrients or provenance.
- Add a Nutrition-page data-quality workspace for selecting a Pantry product, entering a normalized manual label record, selecting/calculating a recipe, reviewing totals/per-serving quality and missing reasons, and explicitly logging servings to an authorized Food Diary profile.
- Use only new domain/service/routes/tests plus `nutrition-foundation-service.ts`, `nutrition-intake-service.ts`, Nutrition page/dashboard/CSS, and Nutrition API shared error mapping. Read Pantry products/mappings and recipes through stable schema/service reads; do not modify Pantry-owned files or shared docs in this package.
- Verify pure conversion/quality tests, service history/provenance/privacy tests, API origin/auth/payload tests, Nutrition component semantics, full unit/integration suites, lint, types, focused formatting, and scoped diff checks. Build/render proof remains a separate environment gate while the existing `.next` owner is active.

## Blocking unknowns

No schema blocker exists. The main correctness risks are ambiguous serving text, record-basis semantics beyond the deliberately supported matrix, and missing production food-record input. The Worker must surface unsupported cases rather than widening conversions. A Judge should convert this map into exact allowed files and stop conditions before implementation.

The exact GoalBuddy Scout exceeded the single-wait limit. The PM produced this same read-only evidence receipt as permitted fallback.
