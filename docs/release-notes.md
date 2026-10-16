# Release notes

## 1.0.0-rc.10

- Refine the profile menu, AI chat composer, recipebook search and bulk actions, pantry intake, Nutrition controls, planner cards, and settings layouts for desktop and mobile.
- Add confirmed AI actions for regenerating existing recipe images and creating or editing shopping lists.
- Add rapid barcode scanning with counted quantities and image-backed product matches; support touch and mouse aisle reordering.
- Create or update a pantry-aware shopping list when a generated meal plan is confirmed.
- No database migration is required. In-progress mobile-app work remains excluded from this release.

## 1.0.0-rc.9

- Supersedes the unpublished rc.8 image candidate and synchronizes the service-worker version with release metadata.
- Give kitchen chat an explicit, current household roster and authenticated admin/parent planning permissions, while preserving each member's AI sharing preferences.
- Add focused, searchable and paginated reads for pantry inventory, shopping-list items, supermarket aisle routes, and relevant shopping/profile preferences.
- Include store selections, units, time zones and sharing status in chat context; distinguish withheld data from missing records.
- Scope chat nutrition and generated meal-plan context to account permissions. Keep shared schedules readable when underlying recipe sharing is disabled.
- No database migration is required. Unrelated mobile work in progress is excluded.

## 1.0.0-rc.7

- Supersedes the unpublished rc.6 build candidate.
- Fixed the planner recipe selector so meal-type shortcuts do not overlap the meal tabs or results.
- Docker releases now build amd64 and arm64 on native GitHub runners and cache build layers.

- Updated framework, PDF/image import, SMTP, and transitive dependencies to patched releases.

- Unified app and profile settings with labeled control rows, explanations, responsive layouts, and subsections for backups, passkeys, integrations, and background tasks.
- Added personal passkey listing and removal in Account security, and integrated local backup recovery into System settings.
- Expanded kitchen-assistant planning with leftovers, single-item meals, takeout, partial plan updates, meal-plan previews, image attachments, and retained conversations.
- Added reviewed recipe variations and temporary meal substitutions with grocery-list context.
- Refined recipebook insights, recipe pages, pantry matching, nutrition summaries, mobile navigation, dialogs, and loading states.
- Unified PDF print previews for recipes, meal plans, shopping lists, and pantry inventory, with export-specific options.
- Added pantry inventory counting and shopping-list shortcuts, notes, and bulk item actions.
- Added an optional Redis/BullMQ queue, weekly meal-plan draft schedules, and bulk recipe/image processing preferences. Server configuration is documented in `docs/printing-and-automation.md`.
- Includes additive database migrations through `0064_shopping_list_notes`. Back up your data before upgrading; rolling back the image does not roll back database migrations.
- Mobile-app work in progress is excluded from this release.

## 1.0.0-rc.5

- Moved personal preferences, appearance, nutrition settings, and integrations into My profile.
- Kept household configuration and role management in admin-only Settings.
- Added Nutrition weigh-ins, VeSync sync, and recorded/calculated body measurements.
- Current weight follows the latest dated observation, including scheduled scale imports; saving preferences preserves it.
- Refined settings layouts and added feet/inches height entry alongside centimetres.
- Removed low-contrast intermediate colours when switching shopping filters.
- Stabilized accessibility checks by waiting for rendered pages.
- Supersedes the unpublished rc.4 candidate. No database migration is required.

## 1.0.0-rc.3

- Refined nutrition onboarding, VeSync account/profile sync and optional body composition estimates.
- Improved pantry restocking policies, shopping workflows, Instacart list links and recipe/meal-plan PDF exports.
- Added contextual AI reviews with evidence, cached decisions, retained corrections and reviewed chat actions.
- Unified page headers, widened laptop layouts and reorganized the full-width planner and sidebar.
- Replaced household profile PINs with account password confirmation and expanded core API access.
- Fixed shopping-preference saves when the automatic restock target is unset, dark-mode control contrast, and contextual review heading order.
- Shopping rows show the calculated purchase amount and distinguish unknown amounts from recipe demand.
- Fixed competing redirects after password sign-in and kept completed purchase forms readable.
- Profile cookies follow the configured authentication URL so local HTTP deployments retain their selected Nutrition profile.
- Includes database migrations through `0061_decision_assistance`.

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
