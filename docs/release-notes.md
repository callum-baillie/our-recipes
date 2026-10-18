# Release notes

## 1.0.0-rc.15

- Increase the default immediate AI allowance to 10 actions per account per ten minutes.
- Add administrator AI settings for installation access, account access, task models and reasoning, and queued Direct/Batch processing defaults. Personal model and processing overrides inherit shared defaults and cannot bypass administrator restrictions.
- Default queued recipe sets and images to Batch from two items. Preserve previous automation preferences when migrating and block unsubmitted work after access is revoked. Submitted batches remain recoverable and cancellable.
- Add bulk recipe imports from 2–20 prompts, public links, or separate recipe photos, with explicit paid confirmation, server image normalization, protected URL capture, background progress, and review before saving.
- Add a multi-source recipe import tool in chat and support up to 20 image attachments within the existing total upload limit.
- Include additive migration `0068_ai_account_settings`; back up household data before upgrading. Provider credentials stay server-side and no live OpenAI calls are required by the test suite.

## 1.0.0-rc.14

- Add the native Bòrd Food API transport alongside the existing USDA/OFF providers, with server-only credentials, bounded validated requests and explicit direct/preferred/catalog-only modes.
- Pin reviewed foods to exact source revisions, retain durable nutrition provenance, and require renewed review when a selected revision changes or disappears. Completed imports can replay during catalog outages.
- Add mobile-friendly official branch search, link/unlink and update review to saved stores while preserving household labels, notes, aisle identities, routes and shopping-list relationships.
- Display sanitized catalog/source readiness, unknown retail availability and official map links with explicit rights status. Catalog reads create no stock or cart actions; catalog-only mode blocks remote fallback and source images.
- Keep local USDA barcode matching available when the optional product pack is absent, and apply generic/branded USDA filters before pagination.
- Isolate caches by transport/configuration, generation, normalizer and locale, without charging local catalog reads against external provider quotas.
- Include additive migration `0067_bord_catalog_links`. Back up household data before upgrading. Native catalog activation requires the server settings in [the integration guide](bord-catalog-integration.md).

Validation includes deterministic catalog/client/auth tests, migration and outage checks, OpenAPI validation, production build/artifact verification, and production browser checks at 320/390/768/1440px with light/dark accessibility. Live activation evidence is recorded separately from fixture evidence. In-progress mobile-app work is excluded from this release.

## 1.0.0-rc.13

- Keep recipe and pantry quick filters in one horizontally scrollable row on desktop, with overflow arrows and all filters available without expanding the page.
- Combine search and tags into a compact mobile surface with an inset search field, swipeable tags, clear selected states, and touch-sized controls.
- Preserve keyboard access to off-screen tags and bring selected filters into view without scrolling the page. Remove duplicated hidden tag measurement markup.
- Verify desktop, tablet, and 320/390px mobile layouts, actual tag/search results, advanced search, pantry filtering, and dark-theme accessibility. No database migration is required.

## 1.0.0-rc.12

- Rebuild planner cards with inset photos, clearer titles and household context, aligned serving/time details, and centered square menu buttons, following the supplied mockup.
- Replace the planner settings sidebar with a shared native dialog used by the meal editor, with scroll locking, focus containment and restoration, Escape/backdrop dismissal, and mobile viewport support.
- Refine planning dates, meal and household choices, meal-type editing, loading/error feedback, and a footer that remains visible while content scrolls.
- Fix inherited mobile summary padding, stray meal-heading dividers, and desktop cards overlapping following calendar rows.
- Verify 320, 390, 768, and 1440px layouts, dark-theme accessibility, modal keyboard behavior, meal editing, and the planner assignment workflow. No database migration is required.

## 1.0.0-rc.11

### Kitchen assistant

- Confirmed image groups run as durable background jobs, with per-recipe results, partial-failure alerts, completion summaries, and retries limited to unfinished work.
- Fixes groups stopping after four images because each image previously consumed a separate interactive rate-limit allowance.
- Compact mobile action cards, expandable bulk reviews, a floating background-task viewer, an editable draft tray for revising recipes and meal plans before saving, and conversation settings behind a gear button.
- Chat content follows the keyboard viewport while the drawer background continues to the device edge.
- Editable kitchen interviews preserve tastes, snack and dessert habits, and household routines. AI access follows each member's sharing settings; allergies and exclusions take priority over taste preferences.

### Meal planning and cooking

- Alternative recipe/Pantry choices, fasting, and named eating-out entries.
- Individual household-member assignments allow different meals in the same slot.
- Refined mobile card menus, move/swap controls, and aligned calendar tabs.
- Full-recipe and step-by-step cooking views, swipe navigation, a touch toolbar, and elapsed-time-aware timers.

### Shopping and loading

- Mobile shopping toolbar, explicit cart/unavailable actions, substitutes, shopping chat, and unpacking flows.
- Purchased quantities stay separate from demand; readable fractions and rounded display amounts replace long decimals.
- Instacart appears only when configured. Counted ingredients without a written unit retain their demand; the example Stovies onion explicitly uses “each”.
- Page-specific skeletons, async field placeholders, and loading feedback across recipe, pantry, profile, shopping, and settings controls.

### Upgrade

Includes additive migrations 0065 and 0066. Back up household data before upgrading. Background AI work requires the server to remain running, but does not require an open browser. No new paid OpenAI requests were made during validation.

### Validation

- 371 release unit tests passed.
- 249 integration tests passed; 9 existing environment-dependent tests skipped.
- Production build and standalone artifact verification passed.
- Browser coverage includes setup, accessibility, desktop/tablet/mobile recipe layouts, pantry and grocery workflows, meal assignment, cooking confirmation and undo, partial cart quantities, saved kitchen interviews, and simulated mobile keyboard positioning.
- OpenAPI validation, route coverage, generated-client smoke checks, TypeScript, lint, and formatting checks passed for the release changes.

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
