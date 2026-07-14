# T002: Competitive research

Task: `T002`
Kind: `scout`
Status: `current`

## Summary

The named products converge on an end-to-end loop: get a recipe into a structured personal collection, make it easy to cook from, schedule it, and turn the schedule into an editable shopping list. The strongest transferable patterns are reviewable ingestion, structured ingredients that power scaling and safe list aggregation, mobile-first cooking assistance, flexible household organization, and low-friction shared planning. Our Recipes should use these as behavior references only—not copy their visual language, wording, or proprietary design.

## Findings and implications

### Capture and portability

- **Mealie** supports manual creation, structured HTML/JSON input, web and migration imports, plus optional AI image/video-assisted capture. Its documented migration list reinforces that import/export is a long-term portability commitment, not a one-off parser.
- **Tandoor** supports structured website import, a broad set of migration formats, and staged external-file import. Its distinction between structured recipes and files awaiting conversion supports keeping imported candidates separate from saved recipes.
- **RecipeSage** documents URL, text, image, PDF, and multiple export-format imports; its photo guidance explicitly tells users to check extraction results because they can be inaccurate.
- **Paprika** demonstrates direct browser clipping plus portable recipe exports; **AnyList** demonstrates web import from recipe sites; **Samsung Food** demonstrates saving recipes from web/community sources.

**Implementation implication:** Every source should first produce a durable, reviewable candidate with provenance, extraction warnings, and an explicit save action. Structured JSON-LD is the preferred non-AI path; image/PDF/text normalization must surface uncertainty rather than silently committing data. Batch imports need progress, duplication awareness, and reversible provenance.

### Household organization and discovery

- **Tandoor** emphasizes full-text search, tags/cookbooks, bulk organization, and merge/rename workflows for ingredients, tags, and units.
- **Mealie** separates shared recipe collections from household-scoped planning/shopping and exposes organizers such as tags and categories.
- **Paprika** and **RecipeSage** reinforce fast collection search, favorites, categories/labels, and source-aware recipe detail.

**Implementation implication:** Prioritize FTS-backed search, flexible household tags/collections, attribution, and safe merge/rename tooling. Keep shared recipe content distinct from per-profile preferences and history; make the non-security nature of profiles explicit.

### Cooking, scaling, and lists

- **Paprika** combines active-step highlighting, ingredient check-off, timers detected in directions, screen wake behavior, multi-image recipes, serving scaling, and metric/imperial conversion.
- **RecipeSage** supports ingredient selection and scaling when adding a recipe to a shopping list.
- **Tandoor**, **Mealie**, **AnyList**, and **Samsung Food** all connect recipes or meal plans to shopping lists. Their documented behaviors include aisle/category organization, optional collaboration, manually editable lists, and recipe-origin context.

**Implementation implication:** Preserve structured ingredient quantities and source recipes through scaling and shopping generation. Generate conservative combined items grouped by an editable aisle taxonomy, but leave users an easy correction path and never create unsafe weight-volume conversions.

### Planning, offline, and mobile

- **Paprika** supports reusable menus and weekly/monthly planning; **Tandoor** supports meal-plan-to-list conversion; **RecipeSage** allows dated meal-plan items and notes; **Samsung Food** supports drag-and-drop weekly planning, family collaboration, and list conversion.
- **AnyList** makes immediate shared-list feedback and automatic category grouping central to its household value.
- **RecipeSage** demonstrates installable/mobile offline patterns, but its latest release includes offline mutations—beyond this goal’s safer first-release requirement of read-only offline access.

**Implementation implication:** Implement shared meal plans and versioned shopping-list updates without silently overwriting another device. Deliver a strong read-only offline recipe experience first; do not imply write success offline without tested queuing and conflict handling.

## Official sources consulted

- Mealie features: <https://docs.mealie.io/documentation/getting-started/features/>
- Tandoor feature overview, shopping, and import/export: <https://docs.tandoor.dev/>, <https://docs.tandoor.dev/features/shopping/>, <https://docs.tandoor.dev/features/import_export/>
- RecipeSage import, editing, meal plans, shopping, export, and releases: <https://docs.recipesage.com/docs/tutorials/settings/import/>, <https://docs.recipesage.com/docs/tutorials/recipes/edit-recipe/>, <https://docs.recipesage.com/docs/tutorials/meal-plans/create/>, <https://docs.recipesage.com/docs/tutorials/shopping-lists/create/>, <https://docs.recipesage.com/docs/tutorials/settings/export/>, <https://docs.recipesage.com/docs/release-notes/>
- Paprika product page and user guide: <https://www.paprikaapp.com/>, <https://www.paprikaapp.com/help/windows/>
- AnyList product page: <https://www.anylist.com/>
- Samsung Food meal planning and product pages: <https://samsungfood.com/meal-planner/>, <https://samsungfood.com/about/>, <https://samsungfood.com/food-plus/>

## Limits

This research intentionally does not endorse authentication, cloud sync, pantry/inventory, nutrition databases, public communities, retail integrations, or subscription patterns for the initial Our Recipes release; those are out of scope or explicitly excluded. Current dependency and framework selection remains T003 work.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  note: notes/T002-competitive-research.md
  summary: "Official product research supports review-first capture, structured ingredient flows, editable plan-to-list generation, and read-only-first offline behavior."
```
