# T080 deterministic recommendation map

## Current evidence and joins

- `evaluateNutritionInsights` already enforces a useful recurring-pattern floor: at least three observed diary days and at least 50% nutrient-specific coverage. It produces target/range/limit status without treating limits as goals, but its food ideas are generic strings and have no recipe, Pantry, plan, grocery or dismissal join.
- Private inputs are available only through signed-principal services: accessible profiles, immutable intake revisions, current goal versions and per-person meal projections. A recommendation service should require `canViewDiary`, `canManageGoals`, and `canManageProfile` for the selected profile because dietary preferences/allergies and targets are sensitive inputs; a viewer-only grant must not receive inferred candidate details.
- Current recipe calculations provide immutable current-revision per-serving nutrient amounts, completeness/confidence and contribution nutrition-record identities. Candidates must use the single latest current calculation, require an unambiguous serving count, and meet at least 50% recipe completeness and 50% confidence for the selected nutrient. Missing values are unknown, not zero.
- Exact profile allergies can be compared to normalized `pantry_products.allergens` for every mapped included contribution. If the profile has any allergy and a candidate contribution cannot be resolved to a product, suppress that candidate. Exact dietary exclusions/preferences may be compared only to explicit product dietary tags or recipe metadata; do not infer sensitive attributes from behavior or silently treat an unknown tag as compatible.
- `listRecipePantryAvailability` is a read-only stock join that preserves ready/partial/unknown and exact/approximate semantics. Pantry stock remains availability only. A recommendation may label ready stock, exact shortages and unknown availability, but never count it as consumed.
- Pantry batch date/status data can be read directly or through stable expiry helpers to explain that an included compatible product has a soon-expiring batch. Expired, depleted, discarded and donated batches must not be promoted. The recommendation must not make a safety claim from best-before alone.
- `getNutritionMealProjection` supplies explicit private allocations and per-day planned totals. A projected-gap recommendation should use only explicit assigned servings; unassigned servings are not attributed. Recurring diary gaps and projected plan gaps must be labeled separately.
- Existing shopping-list item creation is trusted-origin validated and always a deliberate user mutation. The Nutrition UI can require the user to select a current list and confirm an exact shortage line before calling that existing endpoint. It must not create a list/item on render, auto-add all ingredients, or claim a purchase/Pantry intake.
- The schema currently has no Nutrition insight/dismissal persistence despite the conceptual model. An additive `0023` migration can add one private feedback table keyed by profile and deterministic recommendation key with `dismissed`, `helpful`, or `not_helpful` state, reason, revision/audit identity and timestamps. The generated recommendation itself remains reproducible source-of-truth data, not an opaque mutable cache.
- Deterministic recommendation keys should hash profile ID, recommendation kind, nutrient, current goal-version identity, seven-day diary/projection evidence digest, recipe calculation ID and Pantry availability digest. Dismissal/feedback applies only to that evidence version; changed evidence naturally yields a new key.

## Explicit formula and ordering

For a quality-qualified target/minimum or lower-bound range gap:

1. `gap = max(0, goal boundary - observed or planned daily average)`.
2. `candidate coverage = min(recipe per-serving nutrient / gap, 1)` for explanation only, shown as a percentage of that specific gap.
3. Exclude allergy conflicts, unresolved allergy evidence, explicit dietary exclusions, stale/low-quality calculations, zero selected nutrient, and candidates that would exceed an applicable configured limit using current/planned amount plus one serving.
4. Order lexicographically, not by an opaque health score: higher gap coverage, ready before partial before unknown Pantry state, more soon-expiring compatible products, higher completeness, higher confidence, then recipe title/ID.
5. Return the underlying nutrient amount, gap, target semantics, Pantry state, exact shortages/unknown reasons, expiring-product labels, calculation quality and plain-language explanation.

For an excess/limit pattern, show factual lower-per-serving alternatives only when the same data-quality and constraint rules pass; never tell the user to reach a limit or diagnose a condition.

## Largest safe Worker package

Add the private feedback migration/model, a pure recommendation domain module, a server-owned read service using existing Nutrition/recipe/Pantry/planner reads, a strict feedback mutation route, and an accessible Nutrition Overview recommendation panel with deterministic explanations, dismissal/feedback, and explicit one-shortage-at-a-time grocery confirmation using existing shopping-list APIs.

Allowed files:

- `src/lib/db/schema.ts`
- `drizzle/0023_nutrition_insight_feedback.sql`
- `drizzle/meta/_journal.json`
- new `src/lib/domain/nutrition-recommendations.ts`
- new `src/lib/services/nutrition-recommendation-service.ts`
- new `src/app/api/v1/nutrition/profiles/[profileId]/recommendations/[recommendationKey]/feedback/route.ts`
- `src/app/api/v1/nutrition/_shared.ts` only for error mapping if required
- `src/app/nutrition/page.tsx`
- `src/components/nutrition-dashboard.tsx`
- `src/components/nutrition-dashboard.module.css`
- new focused unit/integration/API/component tests

No Pantry domain/service/component/API file is allowed. Pantry T038 may continue. The Worker may read current Pantry tables and call stable read helpers, and may expose an explicit UI call to the existing shopping-list item route; it must not edit or automatically invoke Pantry/grocery mutation services.

Verify migration/schema parity and fresh migration, pure formula/quality/allergy/limit/deterministic-key tests, private service and feedback authorization, no hidden profile leakage, component communication, focused/full tests, lint, typecheck, formatting and scoped diff integrity. Stop for Pantry-owned edits, speculative tag inference, low-quality candidates, automatic list/Pantry mutation, medical/regulated/moral language, browser-owned recommendation truth, or inability to bind feedback to deterministic evidence.

Parallel safety is false for the Worker because schema/migration and Nutrition Overview are broad shared seams, even though its allowed files are disjoint from active Pantry T038.

The exact GoalBuddy Scout exceeded the single 30-second wait and was interrupted. The PM completed the same read-only map as permitted fallback.
