# T999 — Release audit after JSON-LD portability

## Result: not complete

T035 completes the local JSON-LD import/export boundary and has fresh automated evidence, but the supplied production outcome is not yet proven. The goal oracle requires a fresh Docker deployment to complete the end-to-end household workflow with current release-gate evidence; no such evidence exists in this workspace.

## Evidence mapped to the current release criteria

| Area | Current evidence | Audit result |
| --- | --- | --- |
| Household, shared recipes, profiles, favorites/history, tagged collections, structured editing/revisions, search, cooking, plans, shopping, print, backup/restore, PWA read-only cache | T007–T033 receipts and current unit/integration/e2e/a11y suites | Implemented, but not yet exercised together in the final acceptance workflow. |
| Text, document/scan, and pasted JSON-LD review-first imports | T017, T033, and T035 receipts | Implemented with explicit review. |
| Standards-compatible public URL import | Existing capture route uses safe server-side fetching but converts fetched text with the heuristic text parser. It does not yet select deterministic JSON-LD/microdata/Open Graph recipe candidates from an HTML page. | Missing core requirement; select T036. |
| JSON-LD export | T035 service/API/tests | Implemented, deliberately limited to safe currently modeled fields. |
| OpenAI structured extraction, vision, and image generation | No provider boundary or mocks; no credential decision or live-call approval. | Missing; separate credential-gated package. |
| Rich recipe fields and exports | Current schema lacks several required first-class values such as profile ratings/notes, equipment, nutrition, Markdown export, and portable image bundle behavior. | Missing; later data-model/portability package. |
| Operational proof | Docker/Unraid artifacts and local backup/restore tests exist; Docker daemon/mounted-volume, health/persistence, clean migration, and Unraid operator proof do not. | Missing external-state evidence. |
| Release visual/performance/accessibility evidence | Focused desktop/mobile import inspection plus axe and browser suites pass. No full desktop/tablet/mobile/light/dark/A4/Letter/performance acceptance matrix exists. | Missing final release evidence. |

## Next task decision

T036 is the largest safe remaining product slice: preserve the existing SSRF, redirect, content-type, response-size, and timeout controls while converting public HTML pages into deterministic, review-first Recipe candidates. It will parse bounded embedded Schema.org JSON-LD (including `@graph` and multiple recipe candidates), then bounded Microdata/Open Graph fallback metadata, require candidate selection, and hand the existing recipe review form a standard recipe draft. It must not add remote image downloads, archive/file intake, provider calls, credentials, or live external tests; deterministic mock DNS/fetch fixtures prove every URL path.

OpenAI remains deferred under the user-required credential gate. Docker/Unraid proof remains deferred until a daemon/host becomes available. Neither is a reason to stop safe local product work.
