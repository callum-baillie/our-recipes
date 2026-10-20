# Current refinement evidence

These are fresh synthetic fixtures. Before captures use isolated starting revision `a278f81`; after captures use the working implementation on `refinement/full-project-completion`. The final tested code revision and command results are recorded in [the verification receipt](../../docs/refinement/release-evidence.md).

The two households differ in test people and products; these comparisons establish presentation and context, not a pixel-only implementation diff. Historical `screenshots/bord` images remain baseline files.

## Full pages

Desktop viewports are1440×1000; phone viewports are390×844. Images are full-page captures.

| Page                     | Desktop before / after                                                | Phone before / after                                                |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Today                    | [Before](before/today-1440.png) · [After](after/today-1440.png)       | [Before](before/today-390.png) · [After](after/today-390.png)       |
| Food Diary               | [Before](before/diary-1440.png) · [After](after/diary-1440.png)       | [Before](before/diary-390.png) · [After](after/diary-390.png)       |
| My profile               | [Before](before/account-1440.png) · [After](after/account-1440.png)   | [Before](before/account-390.png) · [After](after/account-390.png)   |
| Shared AI administration | [Before](before/ai-1440.png) · [After](after/ai-1440.png)             | [Before](before/ai-390.png) · [After](after/ai-390.png)             |
| Household profiles       | [Before](before/profiles-1440.png) · [After](after/profiles-1440.png) | [Before](before/profiles-390.png) · [After](after/profiles-390.png) |
| Stores and routes        | [Before](before/stores-1440.png) · [After](after/stores-1440.png)     | [Before](before/stores-390.png) · [After](after/stores-390.png)     |

## Interaction evidence

- [Workflow/image index](workflow-images.json): short long-review dialogs, uncertain meal selection, local errors, acknowledged stock recovery, cooking controls and version-bound photo candidates. Synthetic photos do not prove live photographic quality.
- [Settings](settings/manifest.json): persisted switches, advanced field errors, retained interview drafts, onboarding choices/security acknowledgement, conflict reconciliation, compact store selector, guardian controls and copy destination.
- [AI](ai/manifest.json): prompt validation/version conflicts, progressive text, next-message draft, exact recovery and short/enlarged-text layouts.
- [Offline/update](offline/manifest.json): entered-work preservation and explicit retry using controlled notifications and server responses; no deployed update claim.
- [Catalog](../refinement/catalog-native/manifest.json): reviewed source/revision, measures, guidance, bounded retail evidence, uncertain import and explicit store proximity.
- [Actual PDF documents](documents/manifest.json):8 A4/Letter files,38 inspected pages. These are generated documents, separate from workspace screenshots; no physical printer result is claimed.

The executable Playwright scenarios are under `tests/e2e/*refinement*`, `workflow-backlog`, `settings-nutrition-completion`, `recipe-image-review`, `ai-completion` and `pantry-add-recovery`. Each fixture states its own interception and viewport scope. Scoped axe and keyboard checks are not blanket WCAG conformance or native screen-reader approval.

## Clean-runner font correction

[Before/after and exact tested CSS hashes](font-layout/manifest.json) cover the 24px desktop lookup mismatch. The wider font is a controlled test override, not a new application font. The default-font capture shows the ordinary interface.
