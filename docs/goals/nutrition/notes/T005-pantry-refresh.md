# T005 — Pantry and persistence seam refresh

Snapshot: 2026-07-18 after Nutrition T004. The exact GoalBuddy Scout exceeded the one-wait limit; PM completed this read-only fallback.

## Current Pantry truth

- The Pantry board remains `active` on Worker T004 with no Worker receipt. Its approved scope is the foundational event-backed vertical slice only; recipe availability, meal allocation, grocery shortages, purchase flow, and cooking deduction remain later work even if isolated helper seams exist.
- Actual in-progress files now include migration `0015_pantry_inventory.sql`, Drizzle schema additions, `inventory-units.ts`, `pantry.ts`, `pantry-service.ts`, nine Pantry API files, `/pantry`, `PantryManager` plus module CSS, and a Pantry navigation entry.
- The Pantry Worker has not yet created the approved `tests/unit/pantry.test.ts`, `tests/integration/pantry-service.test.ts`, decision record, or full documentation set. It therefore has no current package verification proof.
- Nutrition must not modify Pantry-owned schema, migration journal, Pantry files, app header, or shared docs while that Worker remains active.

## Stable-looking integration seams (not yet accepted)

- `pantryProducts` separates reusable identity from `pantryBatches`. Products support generic household items (brand/variant optional), aliases, identifiers, dietary tags/allergens, default inventory/package/storage data, and stock settings. This is a sound provisional anchor for ingredient and packaged-product nutrition records once the Pantry Worker passes review.
- `recipeIngredientProductMappings` gives each current recipe ingredient an optional reusable product mapping with match type, variant compatibility, optional flag and actor attribution. It is the natural bridge for ingredient-derived recipe nutrition; raw ingredient text remains preserved.
- `pantryBatches` and `pantryInventoryEvents` model availability, expiry, location, quantity and audit only. No nutrient value belongs on a physical batch unless a future lot-specific label deliberately overrides the reusable product record. Batch quantity must never become intake.
- `inventory-units.ts` normalizes count, mass and volume and converts only within compatible dimensions; it rejects incompatible/unknown conversions. Nutrition can reuse this seam after Pantry acceptance. Volume-to-mass still requires product-specific density metadata, which Pantry does not yet store.
- `consumePantryProductStock` performs explicit product-level stock deduction transactionally across eligible batches using compatible units and FEFO-like ordering, writing inventory events. It should be invoked only by an explicit prepared/cooking command and remain independent from consumption logging.
- Pantry APIs use the existing trusted-origin plus selected ActorContext helper. That is adequate for shared inventory attribution, not Nutrition privacy.

## Remaining Pantry and cross-feature limits

- No Pantry nutrition record/source/version/confidence/completeness data exists.
- No density, edible-portion, drained-weight, cooked-food, yield, retention, or nutrient calculation metadata exists.
- No Pantry service links planned meal demand, grocery shortage math, confirmed purchased-item intake, prepared recipe instances, serving allocation, or consumption.
- The Pantry product anchor is provisional until T004 receipt plus migration/data-integrity review. Nutrition migration must be numbered after the final Pantry migration journal state and must not rewrite `0015`.

## Current baseline

- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test:unit`: pass, 15 files / 85 tests (includes Nutrition T004; no Pantry test file yet).
- `pnpm test:integration`: pass, 9 files / 30 tests (no Pantry integration file yet).
- Repository-wide format remains known pre-existing red and was not rerun.

## Decision questions for T006

1. Because Pantry schema is still actively owned, should the next slice build only the real local Nutrition credential/session and sensitive profile/goal validation primitives in new files? **Recommended:** yes.
2. Should Pantry product be approved as the food/product nutrition anchor now? **Decision:** provisional only; record the intended FK/bridge but wait for Pantry migration review before persistence.
3. Can privacy permissions use `profileId` as viewer identity? **Decision:** no. The switchable profile is attribution/context only. A separate Nutrition principal session must authenticate the viewer; profile links may personalize display after authorization.
4. How should existing eight recipe values migrate? Preserve later as legacy current per-serving nutrition with unknown/manual-or-estimated provenance, current recipe revision and explicit incompleteness. Never label verified or ingredient-calculated.
5. Which next package is safe? A new-file local access/session cryptographic primitive plus sensitive profile/goal/permission validation domain and focused tests. It advances the hardest privacy invariant without touching Pantry/schema/UI.

## Next safe package candidates

1. **Privacy/access kernel (recommended now):** local salted credential hashing/verification, signed expiring scoped session values, constant-time verification, safe cookie payload validation, permission decision function, sensitive profile/goal schemas and validation, all in new files and unit tests.
2. **Persistence vertical slice (after Pantry T004 review):** append-only next migration, schema and services for Nutrition sources/definitions/product nutrient records/calculation versions plus legacy backfill. This overlaps `schema.ts` and journal and is unsafe now.
3. **Profiles/goals UI/API:** only after real access kernel and persistence exist; requires a privacy Judge boundary before exposing detailed records.
