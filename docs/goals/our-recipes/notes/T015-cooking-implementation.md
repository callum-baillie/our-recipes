# T015 — cooking workflow implementation receipt

## Delivered

- A profile can open focused cooking mode from any recipe, choose a target serving count, and see scaled numeric ingredient quantities without modifying shared recipe data.
- The cooking screen provides step focus, multiple independent local timers, an explicitly labeled Celsius/Fahrenheit calculator, and clear original-data language.
- Favorites and cook sessions are profile-scoped database records. Starting and completing a cooking session use signed profile context and trusted-origin APIs.
- A browser workflow covers favorite, start, timer, finish, and return to the recipe; unit/integration coverage proves scaling/conversion and favorite/session persistence.

## Verification

Frozen install, formatting, lint, strict typecheck, seven unit tests, four SQLite integration tests, Chromium end-to-end workflow, axe, OpenAPI validation, production build, and diff check pass. The OpenAPI linter emits only its existing non-blocking metadata recommendations.

## Remaining gaps

The next major product requirement is review-first capture/import, including hardened URL/text/file/image/PDF/handwriting boundaries. Images, PWA, backup/restore, Docker/Unraid, and final release proof also remain.
