# T111 — surface preference and recipe-library audit

## Decision: approved

- Migration 0026 is additive, ordered after 0025, and supplies true/energy-protein-fiber/true defaults. Fresh in-memory databases applied it in the full integration suite.
- The profile schema rejects empty, duplicate, unsupported, and six-code compact lists. All three preferences flow through insert/update, safe accessible summaries, private settings, optimistic PATCH, and UI controls.
- `/recipes` preserves household ActorContext only for its prior recipe preference calls. It independently resolves the signed Nutrition session and passes only that principal's accessible profile list to a pure selection helper. A requested outsider ID falls back to the first accessible profile, as covered by integration assertions.
- Accessible summaries expose only display preferences alongside their pre-existing safe fields. No target, allergy, measurement, diary record, or credential is added.
- Visibility remains authoritative even when URL compact-field overrides exist; all URL values pass the recipe query schema and are capped at five unique allowed fields.
- The route calls `listRecipeNutritionPresentations()` once, never the per-recipe presentation service. The single joined query selects the latest calculation revision exactly as the prior service did and then delegates current/stale/unavailable, per-serving, quality, warning, and missing semantics to the same domain presenter.
- Carbohydrate and total fat are now included with the four prior compact fields. A 101-recipe test confirms one prepared statement with stale and unavailable rows.
- Cards remain neutral factual per-serving values and coverage. Home/upcoming compact variants are unchanged, and missing or stale values do not render as current/zero.
- Focused 51 tests, full 223-unit/125-integration suites, lint, typecheck, and build passed. Only the pre-existing backup-service NFT trace warning remains.

The exact GoalBuddy Judge exceeded its single wait and was interrupted; this PM fallback applied the same read-only rejection criteria.
