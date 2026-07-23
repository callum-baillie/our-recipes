# T009 recipe availability and projected demand

Delivered actor-attributed manual ingredient mappings without rewriting recipe ingredients or revisions. Recipe cards, recipe detail, and cook entry now expose serving-scaled ready/partial/unknown Pantry states with exact ingredient-level reasons. The planner shows aggregate demand from all recipe-linked meals in the selected range.

Demand uses one shared compatible exact-stock pool per product/unit family, so planned meals do not double-allocate the same batch. It is a projection only: no batch quantity, status, version, event, or reservation changes. Approximate, incompatible, unmapped, and missing-quantity inputs remain warnings and never become exact math.

Trusted mapping/availability/demand APIs, focused tests, OpenAPI, API/data-model docs, and ADR 0031 are included. Verification passed: 3 focused unit tests, 2 focused integration tests, 134 full unit tests, 45 full integration tests, lint, TypeScript, OpenAPI, and diff checks. Shared `docs/data-model.md` table formatting remains deferred while nutrition T019 is active.
