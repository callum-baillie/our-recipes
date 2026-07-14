# Product requirements — foundation

This release foundation gives a private household a real, persisted entry point:

1. first visit creates a named household, displayed app name, and first profile;
2. profiles can be created, edited, archived, and selected; their units, temperature, locale, timezone, color, and optional avatar remain preference/attribution data rather than access control;
3. a signed selection cookie provides a future-proof `ActorContext` seam;
4. a later visit restores the household state from SQLite and permits profile switching;
5. the UI never presents profiles as security.
6. profiles can be edited and safely archived without erasing attribution, while household-managed lower-cased tags can be colored, renamed, merged, removed, and offered as recipe-editor autocomplete;
7. household members can curate manually ordered named collections, place a recipe in multiple collections, use existing local recipe photos as safe covers, browse collection detail, and filter the library by collection without altering recipe revisions;
8. a selected household profile can create, search, filter, read, print, duplicate, archive, and revise a shared structured recipe with source attribution, multiple ingredient/method sections, metadata, local recovery drafts, conflict-safe revisions, and household-governed tag autocomplete;
9. a household can schedule saved recipes or free-form breakfast, lunch, dinner, and snack meals for a week; copy a week forward; export an honest local calendar; and create an editable, persistent shopping list without losing manual edits. Store aisles can be named and ordered, and list rows remain visible in their assigned aisle or an explicit unassigned group.
10. a selected profile can cook a recipe in focused mode with scaled quantities, local timers, a labeled temperature converter, and personal favorites/history.
11. pasted text and public URLs create an inspectable recipe draft with provenance; public HTML deterministically offers Schema.org JSON-LD/@graph candidates first, then Microdata, with an explicit Open Graph/text fallback warning; only explicit confirmation saves a shared recipe.
12. a household profile can add or remove a local recipe photo; bounded JPEG/PNG/WebP input is accepted and HEIC/HEIF is converted in the browser before the server validates/stores a normalized local WebP.
13. a household can import one bounded local PDF or one to four bounded JPEG/PNG/WebP recipe scans into an editable, ordered-provenance review draft; browser-selected HEIC/HEIF is converted before upload, a recipe exists only after explicit confirmation, and no provider/network call is made for ordinary import.
14. previously visited recipe pages and their local images remain readable through the installable PWA while offline; no household mutation is cached, queued, or replayed.
15. a household can create, download, validate, preview, and explicitly restore a local checksummed SQLite/media backup; restore makes a safety backup first and never accepts arbitrary uploaded archives.
16. a household can export a deterministic standards-based Schema.org Recipe JSON-LD document, or paste bounded JSON-LD to choose a Recipe candidate, edit it, and explicitly confirm it; this path never fetches a URL, accepts a JSON-LD file/archive, stores pasted source text, or calls a provider.
17. a household can keep optional original-author/source/cooking-method, ordered equipment, and explicitly user-entered nutrition values on a shared recipe card; a selected profile can save only its own 1–5 rating and kitchen note without revising or exporting those personal values, while a deterministic local Markdown download exports the shared card.
18. a selected profile can see only its own favorite/rating indicators and use its own highest-rated library order; each recipe card exposes creator/last-editor attribution and an accessible revision timeline whose explicit restore action appends a conflict-protected shared revision without changing profile-private preferences.
19. when a server-only OpenAI key is configured, a household member can explicitly request a bounded text/normalized-scan review suggestion or a serving image. Every result is audited without raw source, review-first, and locally stored only after validation; no paid request is automatic.

Handwritten-photo and scan extraction is provided by the explicit configured OpenAI vision review action; the bundled local OCR path remains a separate printed/legible-text assist. Docker build, health, and bind-mounted persistence are verified locally, while the Unraid template and deployment documentation leave host deployment to the household operator. A paid live-provider check is deliberately unrun and opt-in; deterministic provider coverage is the release test evidence.
