# Release notes

## 1.0.0-rc.2

This candidate adds Better Auth email/passphrase accounts, optional passkeys, six-digit
profile-switch PIN verification, one-time recovery codes, and a one-time upgrade path for existing
households. The first profile is the admin account; only that account can manage expiring,
rate-limited, per-resource API keys.

Recipes, Meal Plans, Grocery Lists, Collections, and Pantry now expose authenticated scoped CRUD
routes plus bounded NDJSON snapshots. API-key creates use 24-hour idempotency records, every
integration response carries a request ID, and destructive operations preserve recipe revisions,
list provenance, and immutable Pantry history. Restore invalidates sessions and integration
credentials. Authenticated data is excluded from the service-worker cache.

Database changes are additive through schema `0052_refine_shopping_categories`. This local implementation does
not by itself prove SMTP delivery, passkeys on a physical device, Docker/Unraid deployment, or
public-internet readiness.

## 1.0.0-rc.1

This candidate integrates Recipes, pinned Meal Plans, Pantry-aware Lists, confirmed Pantry intake/cooking, prepared Nutrition, explicit consumption, and optional review-first AI actions into one household workflow.

### Highlights

- Refined the responsive Pantry, Nutrition, Planner, Lists, and in-store shopping experiences, including consistent dialogs, mobile navigation, empty states, and loading/error feedback.
- Added guided Nutrition onboarding for households without goals, clearer macro/data coverage presentation, and household weight tracking.
- Added full-width Planner workspaces, responsive day/week/month navigation, manual save history, unified meal-plan generation, and Pantry-aware grocery handoff.
- Expanded shopping trips with in-cart, sourced, and can’t-find states, substitute/retry-store workflows, barcode-assisted matching, and a purpose-built mobile shopping mode.
- Unified Pantry item lookup, barcode entry, scanning, and manual entry while keeping food-provider credentials and imports server-side.
- Refreshed the Bòrd landing definition, global branding, metadata, PWA manifest, route-level skeletons, error states, and mobile header/footer behavior.
- Updated Next.js, tar, and transitive release overrides so the production dependency audit is clean.

Release hardening includes transactional recipe integration commands, durable plan/list provenance, authoritative normalized Nutrition presentation, household-local dates, batched Pantry filtering with 1,000/10,000-recipe guards, redacted diagnostics, current backup metadata, warning-free route-complete OpenAPI, a standalone artifact denylist, and a deterministic browser release oracle.

This is not yet a public v1 tag. Docker candidate evidence, an actual Unraid host, real iPhone Safari, and a populated beta upgrade/restore drill must be recorded in the [release checklist](release-checklist.md) before those distribution targets are claimed.

### Compatibility and deprecation

- Database changes are additive through schema `0044_ai_summary_bundles`.
- Planned meals created before ingredient snapshots are backfilled during migration; explicit plan refresh adopts later recipe changes.
- The ambiguous aisle delete route remains as a compatibility alias, while `/api/v1/shopping-list-aisles/{aisleId}` is the documented canonical route.
- Retired Nutrition credential/session/permission endpoints continue to fail closed with `410`; profiles remain convenience identity.
