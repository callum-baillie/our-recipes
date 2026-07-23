# Release notes

## 1.0.0-rc.1

This candidate integrates Recipes, pinned Meal Plans, Pantry-aware Lists, confirmed Pantry intake/cooking, prepared Nutrition, explicit consumption, and optional review-first AI actions into one household workflow.

Release hardening includes transactional recipe integration commands, durable plan/list provenance, authoritative normalized Nutrition presentation, household-local dates, batched Pantry filtering with 1,000/10,000-recipe guards, redacted diagnostics, current backup metadata, warning-free route-complete OpenAPI, a standalone artifact denylist, and one deterministic browser release oracle.

This is not yet a public v1 tag. Docker candidate evidence, an actual Unraid host, real iPhone Safari, and a populated beta upgrade/restore drill must be recorded in the [release checklist](release-checklist.md) before those distribution targets are claimed.

### Compatibility and deprecation

- Database changes are additive through schema `0038_meal_plan_ingredient_snapshots`.
- Planned meals created before ingredient snapshots are backfilled during migration; explicit plan refresh adopts later recipe changes.
- The ambiguous aisle delete route remains as a compatibility alias, while `/api/v1/shopping-list-aisles/{aisleId}` is the documented canonical route.
- Retired Nutrition credential/session/permission endpoints continue to fail closed with `410`; profiles remain convenience identity.
