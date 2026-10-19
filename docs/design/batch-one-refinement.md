# Bòrd UI refinement: Batch 1

Scope: shared shell, Home, Library, Collections, Tags, global recipe/profile overlays, Kitchen assistance and assistant drawer/settings. Existing mobile application edits are outside this change.

## Source comparison

The October 18 capture archive has no build SHA. References are the supplied `screenshots/bord` captures at 1440 × 1000 and 390 × 844; fixture content in local verification differs from the captured household.

Current source already supplied five recipe sources including bulk entry, mutually exclusive reactions with optimistic rollback/toasts, native proposal disclosures, labelled fresh image proposals, scrolling quick facets, tag removal confirmation, signed actors, trusted mutation origins, and viewport/focus foundations. Those behaviors are retained. Current source also distinguishes `/account/ai` personal preferences from admin-only `/settings/ai` global settings; the drawer names and exposes these destinations separately.

## Changes and visual comparison

| Reference | Observation                                                | Implementation                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01–E05   | Sibling alignment, page height and heading drift           | Shared standard shell and normal-app height contract; focused assistance uses PageHeader; security/planner exceptions retained.                                                                                      |
| E01–E02   | Oversized compact meal, overlapping actions, repeated gaps | Explicit 88px compact thumbnail; reserved action rows; one body spacing mechanism and grouped metadata; reduced shadows.                                                                                             |
| E01–E02   | Zero time, generic readiness and redundant pantry buckets  | Omit the unprovided zero sentinel, exact hours/minutes including rest, neutral saved count, reusable pantry pill with nonzero mixed counts.                                                                          |
| E01, E13  | Search below recent cards; unbounded Home feed             | Visible labelled search near welcome; secondary Filters disclosure; four recent cards in a phone strip; six-result preview with matching total and context-preserving library links.                                 |
| E02, E14  | Ambiguous bulk controls and obscured filter fields         | Explicit selection entry, selected/page print scope and review scope; grouped advanced controls in a scrolling body with separate header/footer.                                                                     |
| E03, E16  | Repeated creation copy and unavailable path emphasized     | One creation form; first-collection dialog leads with Create and add; retained created collection after assignment failure; transport feedback keeps drafts.                                                         |
| E04       | Permanent editors and unclear merge consequences           | Searchable summary list, one guarded editor, full-width phone name, preview of existing/new target and resulting color, secondary removal with existing confirmation.                                                |
| E06–E10   | Vocabulary, parent navigation and floating corners         | Sentence-case actions, preserved five-source chooser, scrolling section nav, open/close mobile trigger, complete floating borders, Switch to [name] title and account-password copy.                                 |
| E05, E15  | Oversized checkbox, weak assistance title and links        | Native control ownership, adjacent opt-in/helper, task prerequisites, terracotta action and explicit settings/store links; remove legacy dark palette alias overrides and placeholder opacity.                       |
| E11–E12   | Generic older proposals and understated disclosures        | Preserve historical labels; identify unavailable titles; visible disclosure chevrons/counts; completed, failed, waiting and not-attempted quantities; distinct personal/global settings links and permission scopes. |

## Verification results

| Check                                                                     | Result                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped Prettier, ESLint, TypeScript and whitespace checks                 | Passed                                                                                                                                                                                                                 |
| Targeted unit tests, including appearance                                 | 29 passed                                                                                                                                                                                                              |
| Home, pantry and assistant integration tests                              | 34 passed                                                                                                                                                                                                              |
| Main routes at 1440 × 1000, 390 × 844, 320 × 640, 768 × 900 and 390 × 568 | No page overflow; identical sibling title left edges                                                                                                                                                                   |
| Browser workflows                                                         | Search/reset, preview links, pagination, selected/page print, named trash confirmation and revision failures, collection recovery, tag editors/merges, consent, assistant results/settings, profile focus/error/cancel |
| Modal and responsive checks                                               | Footer/field separation, last field, reset dismissal, Tab/Shift+Tab loop, Escape/focus return, short viewport, 200% text reflow, reduced motion                                                                        |
| Axe                                                                       | No serious/critical violations on the five main page surfaces and recipe chooser                                                                                                                                       |
| Theme token samples                                                       | Enabled primary action and search placeholder exceed 4.5:1 in all ten palette/mode combinations; minimums 5.12:1 and 5.78:1 respectively                                                                               |
| Representative shared consumers                                           | Planner, print workspace, cooking and sign-in height contracts preserved; current bulk entry loads                                                                                                                     |

The full release pipeline and full end-to-end suite were not run. Existing end-to-end selectors were updated to match the new interaction contracts.

## Environment and evidence

Local Chromium uses an isolated database under `/tmp/bord-batch1`, with `OPENAI_API_KEY` empty. Browser plugin skill was unavailable, so Playwright provided the browser checks. Provider responses and deliberate network failures use deterministic intercepts. No live paid AI request is required or made.

Representative captures and detailed run logs are under `/tmp/bord-batch1`. Supplied captures serve as the visual before reference; local after captures use deterministic fixtures, including a photo, missing images, long titles, unknown time and a 4h 5m duration. This is a comparison of layout contracts and interactions, not a pixel comparison of identical household data.

Physical iOS/Android keyboard behavior remains a device check. Chromium verifies short viewports and the existing visual-viewport CSS contract with a simulated keyboard-sized viewport. Later-batch pages are representative shared-component checks only, not completed audits.
