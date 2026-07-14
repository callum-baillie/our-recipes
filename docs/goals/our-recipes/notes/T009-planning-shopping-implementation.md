# T009 — planning and shopping implementation receipt

## Delivered

- A household can schedule existing recipes for breakfast, lunch, or dinner across the active week, with servings and notes persisted under the selected profile attribution.
- A planned week creates a new editable shopping list every time. Structured numeric ingredients scale from recipe yield to planned servings, combine only when unit/item/note match, and retain source recipe IDs. Non-numeric ingredients remain separate.
- Shopping lists persist independent edits: add, inline edit, check, remove, and explicit up/down reordering. Regeneration does not overwrite any existing list.
- Versioned origin-checked APIs, migration/schema, planner/list surfaces, integration coverage, browser flow, documentation, and ADR are included.

## Verification

The final frozen install, formatter, lint, strict typecheck, five unit tests, three SQLite integration tests, Chromium household-to-list workflow, axe scan, OpenAPI validation, production build, and diff check all pass. Redocly prints three non-blocking metadata recommendations.

## Remaining release gaps

Capture/import hardening, richer recipe/cooking UX, images, PWA, backup/restore, Docker/Unraid, and release audit remain. No external fetch, upload, image processing, AI credential, paid request, or Docker claim was made in this package.
