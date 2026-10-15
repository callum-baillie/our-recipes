# Kitchen workflow refinement — 2026-10-15

## Research and design decisions

Research used official product/help pages, rather than claiming hands-on access to paid competitor applications:

- [Paprika guide](https://www.paprikaapp.com/help/android/): connected recipes, pantry, groceries, and calendar. Bòrd now makes pantry-to-recipe and pantry-to-shopping navigation explicit and adds recipe shortcuts.
- [AnyList recipes](https://www.anylist.com/recipes) and [meal planning](https://www.anylist.com/meal-planning): reuse saved recipes in a plan and grocery workflow. Bòrd's planner puts adding meals ahead of setup controls and keeps print/export beside the week controls.
- [Mealime getting started](https://support.mealime.com/article/151-getting-started-guide): plan, shop, cook as a connected routine. Shopping mode emphasizes remaining items, check-off, and undo; management details remain available separately.
- [Cronometer nutrition reports](https://cronometer.com/blog/how-to-nutrition-report/): daily tracking and deeper analysis serve different needs. Bòrd's diary now has date navigation, per-day totals, coverage labels for partial nutrition, and a direct food logging action. Optional goal setup no longer gates the overview.

The existing visual identity and household data model are retained. These are workflow changes, not copied competitor screens.

## Changes

- Recipe shortcuts for favourites, pantry-ready meals, and quick recipes; more compact header; searchable bulk print selection.
- Pantry summary tiles filter the inventory. Quick add is collapsible. New items default to the main pantry rather than whichever location sorts first.
- Shopping overview highlights the next shop. Shopping mode reduces metadata; done items collapse, state changes prevent duplicate submissions, and Undo restores the previous state.
- Planner defaults to the calendar with an Add a meal action. Plan settings are available on demand.
- Nutrition diary focuses on a selected day, with separate eaten totals and missing-value counts. Log forms default to noon on the selected date in the browser's local time; users can adjust the timestamp. The profile timezone determines which diary day an entry belongs to.
- PDFs use vendored MIT pdfcn Forme components, rendered locally. A4/Letter, bulk cards, combined PDF or separate PDFs in a ZIP, and 1–56-day meal schedules. Long recipes flow to extra pages. Meal cards preserve planned revision and servings; repeated identical cards are deduplicated.
- Three scoped export API operations documented in OpenAPI and `docs/api.md`.

## Boundaries

No schema migration is required. No paid AI calls or external PDF service is used. Recipe-card nutrition is explicitly labeled recipe-provided per-serving estimates; missing values remain unknown. This does not replace the existing ingredient-level nutrition calculation system. Historical planned recipe revisions must exist; otherwise the export returns an actionable conflict.

## Validation evidence

- TypeScript check and targeted ESLint completed successfully.
- OpenAPI description validated with Redocly.
- Manual Chromium review at 1440×1000 and 390×844: nutrition, recipes, pantry, planner, and list overview had no horizontal overflow. Follow-up desktop review and populated shopping-list review reported no page errors. Fixed a competing planner layout grid found during this review.
- Authenticated HTTP export returned a readable recipe PDF and a ZIP containing a two-week schedule plus a separate planned recipe card. Used only an isolated synthetic household database.
- Rendered and visually inspected A4 recipe cards and a long Letter recipe; the long sample produced seven pages and retained its final instructions and nutrition. A two-week sample produced two schedule pages and one recipe-card page.
- Existing unit/integration suites were not rerun for this refinement pass. Docker, mobile-native, PWA, and deployment behavior are not claimed here.

Screenshots and generated samples for this session are under `/tmp/bord-workflows/`.

Final release build passed, including standalone dependency hydration and the 3,058-file artifact check. The packaged standalone server returned HTTP 200 for both a Letter recipe PDF and a meal-plan ZIP containing the schedule and a separate recipe card. A small-quantity sample confirmed that half of 0.001 g prints as 0.0005 g rather than zero.
