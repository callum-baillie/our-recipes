# T006 — recipe-domain vertical-slice decision

## Evidence reviewed

- T013 establishes a passing, persistent SQLite/Drizzle foundation, signed selected-profile seam, origin-checked versioned APIs, responsive visual language, and browser/a11y harness.
- The original release outcome needs structured recipes, revisions, actor attribution, searchable organization, readable cooking content, and a real household workflow before import, AI, planning, or operations features can be valuable.
- The initial foundation intentionally has no fake recipe data or inert recipe controls, so the next package should replace that blank state with a complete manual recipe workflow.

## Decision

T007 will implement the first real recipe-domain workflow: a selected profile manually creates a structured recipe; the shared household library displays/searches it; the recipe has a readable detail page; the creator edits it; and the system persists a revision/audit snapshot with actor attribution. The slice includes source attribution, yield/times, ordered ingredient groups/ingredients, ordered instruction sections/steps, tags, validation, an empty state, and a print-ready recipe document.

This is deliberately broader than a CRUD table and narrower than an import or cooking subsystem. It establishes the canonical recipe model that capture/import, images, scaling, cooking mode, planning, and lists can build on. It does **not** include URL/PDF/image/handwriting ingestion, remote fetching, file upload, image processing, AI calls, timers, unit conversion, meal planning, shopping lists, PWA caching, backups, or Docker work.

## Required proof

The Worker must add migrations and Drizzle data access; use `ActorContext` for creator/editor attribution without treating profiles as security; keep server-only data boundaries and trusted-origin mutation checks; document the versioned contract and new data model; and extend unit, SQLite integration, browser workflow, and axe coverage. A manual recipe must survive a reload and an edit must create a revision. No live OpenAI credential or paid request is authorized.
