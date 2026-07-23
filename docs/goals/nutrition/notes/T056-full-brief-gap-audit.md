# T056 full Nutrition brief gap audit

This is a read-only acceptance audit against the original pasted brief and the current worktree after T055.

## Implemented and currently evidenced

- Top-level `/nutrition` navigation and Overview, Food Diary, Nutrients, Trends, Household and Goals hierarchy.
- Separate private adult/dependent/guest/unassigned Nutrition profiles, signed principal sessions, versioned permissions, guardian/viewer roles, manual goals, reference-derived targets, measurements and normalized household comparison that omits hidden profiles.
- Canonical 46-nutrient definitions, target/range/limit math, macro energy factors, versioned sources/references/calculation algorithms, immutable food records, source priority and explicit safe unit/density/piece conversions.
- Recipe ingredient mappings, contribution quality/missing reasons, optional inclusion, source energy preference/fallback, immutable calculations, current/stale presentation, recipe detail/card values, edit-triggered append-only recalculation and frozen recipe intake snapshots.
- Product/manual/recipe Food Diary creation, server-owned quality/provenance, portion corrections and audited deletion; daily consumed totals, missing-day-aware trend, timezone boundaries, completeness/confidence and basic deterministic sufficient-data insights.
- Explicit fractional per-person planned allocations, aggregate unassigned servings, current-calculation planned totals, planned-versus-consumed separation, prepared actual-yield snapshots, served/skipped/leftover states, partial portions, seconds and atomic idempotent eaten confirmation.
- Current gates through T054: fresh migration through 0021, 171 unit tests, 90 integration tests, lint, typecheck, formatting and scoped diff checks.

## Partial or unverified

- Planner-facing UI remains separate from the Nutrition-side allocation panel; the existing dirty planner files have not received per-person Nutrition previews or controls.
- Recipe cards show a fixed concise normalized set, not user-configurable fields, remaining-target matching, nutrient filters/sorts or transparent density scoring.
- Recipe calculation stores final weight/retention/contribution fields, but the ordinary calculator request only handles optional ingredients and writes no final weight; required exclusions, substitutions, cooked-food selection, yield/water/drain/retention and per-100g/portion workflows are incomplete.
- Food Diary lacks copy yesterday/day/common meal, move to another meal/time, restore deleted entries and cross-authorized profile reassignment. Quick manual calorie-only logging exists through manual values but is not optimized as a named fast path.
- Trends currently render only a basic seven-day calorie bar/table. Domain helpers exist for rolling averages, macro distribution, coverage semantics and comparison, but calorie bullet, macro stacked bar/grams, macro trend, coverage bullets, heatmap/table, planned-versus-consumed chart, nutrient-source ranking, weight trend and completeness chart are not all presented.
- Profile/settings fields exist but the UI exposes only a small onboarding/manual-goal subset; energy units, visible nutrients, trend period, timezone/week start, reference jurisdiction/formula, sharing, weight tracking, card/planner flags, source/recommendation preferences are incomplete.
- Deterministic insights are diary/goal based only. Recipe-library, Pantry expiry/availability, meal plan and grocery-list candidates are not joined into sufficient-data, allergy/preference/permission-aware recommendations or feedback/dismissal workflows.
- Household comparison covers normalized current goals but lacks broader selected-range serving-allocation, planned/consumed, completeness, matrix/small-multiple controls and raw operational cooking/purchasing totals.
- Private Nutrition export and sensitive profile/history deletion are absent even though permission flags exist.
- Offline conflict-aware diary/allocation sync is represented only by stable/idempotent command IDs, not a service worker/offline queue. Daily aggregates/performance caches are absent; projections query live normalized/snapshot rows.
- Nutrition API/data model/reference attribution/formulas/security/operations are not yet documented in the shared docs, and advanced external-provider extension points are not consolidated.

## Missing or environment-only evidence

- No Nutrition-specific Playwright workflow proves profile creation, goals, planned allocation, prepared serving, immutable consumption/history, household privacy, incomplete-data UI, keyboard behavior, responsive layout, accessible chart/tooltips/tables or screenshots.
- A fresh production build and isolated rendered Nutrition runtime have not been proven in this goal. The shared `.next` server remains unsuitable evidence.
- Docker/PWA/backup/Unraid/device/external provider behavior is outside any current proof and must not be inferred.

## Ranked remaining packages

1. **Private Food Diary lifecycle and data rights:** server-owned copy entry/day, move, restore and authorized reassignment with idempotent transactions; deterministic permission-gated export; explicit versioned sensitive-history deletion/scrubbing; accessible UI and tests.
2. **Preparation-aware calculation evidence:** final weight/per-100g/portion, optional/required exclusions, mapped substitutions, direct cooked records where available, explicit edible/drained/yield/water/retention factors and recalculation that unblocks aligned prepared instances.
3. **Recipe library and planner adapters:** nutrition filters/sorts/configurable compact fields, remaining-target match, per-person planner preview/allocation/status controls once dirty ownership is stable.
4. **Pantry/grocery deterministic recommendations:** permission/data-quality/allergy-aware gap candidates, expiring compatible Pantry foods, recipe explanations, explicit grocery confirmation and feedback/dismissal; never auto-add or call live OpenAI.
5. **Settings, full chart set and household analysis:** remaining profile settings, accessible chart/table datasets and controls, weight/completeness/source views and selected-range household small multiples/matrices.
6. **Performance/offline/documentation/final evidence:** bounded aggregates/invalidation where justified, offline command queue if compatible with existing PWA, API/data-model/reference/formula/security docs, fresh migrations/build, isolated Playwright/a11y/responsive workflows and final requirement audit.

The next safe package is rank 1. It is Nutrition-owned and avoids concurrent Pantry/planner product files. It must retain immutable history for ordinary corrections while treating an explicit data-deletion request as a distinct irreversible privacy operation.

The exact GoalBuddy Scout exceeded the single-wait limit and was interrupted. The PM completed the same full read-only audit as permitted fallback.
