# T042 Food Diary product, manual, correction, and deletion slice

Delivered the remaining core Food Diary entry types and revision controls without schema, migration, Pantry T019, planner/cooking, shared-doc, live OpenAI, or `.next` changes.

- Product portions are server-built from the selected immutable product record. The server applies the same evidence-backed unit/basis conversion policy, freezes the product/record/source/reference basis and scaled nutrients, and rejects browser-supplied values or unsupported conversions.
- Product corrections reuse the original immutable food record even when a newer product record exists, preventing historical source drift. They append a latest-only corrected revision with a required reason.
- Manual entries accept explicitly manual nutrient totals but never accept confidence/completeness/estimated claims. The server owns a versioned manual-diary source, fixes confidence at 0.5, derives concise nutrient completeness, and labels every value estimated. Manual corrections remain manual and append with a reason.
- Recipe corrections extend the dedicated server-built path: the browser submits calculation ID and corrected serving count, while the server rescales the immutable calculation and appends the revision.
- Audited deletion loads the authorized current revision server-side and appends a deleted revision with actor, time, and required reason but no nutrients or active source links. Older revisions remain unchanged.
- Latest diary entries expose accessible correct/delete controls. Product and manual creation controls are integrated into the private Nutrition workspace. The server-to-client projection includes only display/correction fields and omits principal IDs, provenance snapshots, and source details.

Focused evidence: 3 unit tests and 2 integration tests pass for strict inputs, server-owned quality, product-record fidelity across correction, immutable manual history, recipe correction, injection rejection, and deletion. Full `pnpm test` passes with 163 unit and 78 integration tests; full lint, typecheck, focused Prettier, and scoped diff checks pass.

The exact GoalBuddy Worker exceeded the single-wait limit. The PM completed the exact allowed-file package as permitted fallback.
