# Workspace headers

Use `PageHeader` for kitchen workspace and settings titles. The component is server-compatible and accepts existing client controls as slots.

| Slot               | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `leading`          | Back link or breadcrumbs before the title                |
| `eyebrow`          | Optional short section label                             |
| `title`, `titleId` | One page-level heading and optional stable accessible ID |
| `description`      | Short subtitle explaining the page                       |
| `meta`             | Quiet counts, dates or status beneath the subtitle       |
| `actions`          | Primary page actions, aligned right on wide layouts      |
| `options`          | Secondary controls beneath the primary actions           |
| `toolbarLeft`      | View tabs, category shortcuts or contextual controls     |
| `toolbarRight`     | Related navigation or secondary tools                    |
| `children`         | Full-width search/filter row below the toolbars          |

The header has no enclosing card. A single separator distinguishes controls from the heading. Empty slots produce no empty rows. Toolbars and actions wrap without changing DOM/tab order; navigation retains its own `aria-current` semantics. Small containers stack controls beneath the title and align both toolbar groups left. Avoid imposing a toolbar ARIA role on a group unless it implements the corresponding keyboard behavior.

The workspace owns outer padding. The header owns its title-to-subtitle spacing, control gaps and bottom gap. Do not pass legacy hero classes with independent typography/margins. `density="compact"` is for the full-height planner, keeping more room for the calendar without introducing a separate header design.

`SettingsPageHeader` adapts its existing props to this component. Recipe editor intros use a div wrapper so the shared header is not nested inside another header. Import stage titles are subheadings under the page title. Recipe library navigation belongs in `toolbarRight`, beside category shortcuts in `toolbarLeft`; search and filters occupy the full-width row below.

## Content and scrolling contracts

- Ordinary pages use the root normal-app height contract: header, flexible main content, then footer. Security surfaces retain their dedicated layouts. The planner retains its full-height workspace behavior.
- `recipe-page recipebook-page` and `workspace-page` use the standard `--content-standard` cap. Library, Collections and Tags share the same outer gutter and title alignment. Existing wide workspaces keep `--workspace-width`; focused tasks use `workspace-page` with `data-width="focused"`.
- `--page-gutter` is 1rem on phones. Inner task forms may be narrower than their page shell. Do not add route-specific outer padding to align siblings.
- `RecipebookNav` owns one contained scrolling row, including inside a `PageHeader`. Keep links unwrapped and full sized. The primary Recipebook route family is defined in `src/lib/recipebook-routes.ts`; the section navigation owns exact `aria-current="page"` destinations.
- Standalone assistance uses a page H1. Embedded assistance uses H2/H3 panel headings; dialog titles use `--panel-title-size`.
- Long dialogs use `AppDialog` and `DialogViewport`. Put a shrinkable, independently scrolling body between the header and footer. `AppDialog` supplies the `--dialog-overflow` and `--dialog-bottom-padding` values so the shared native-dialog rules preserve this layout. Apply/reset actions must close or navigate intentionally.

## Recipe workflows

Recipe editors use one aligned heading and save bar above the core card. Intake uses the focused workspace shell and a concise introduction. Recipe detail keeps its jump link in flow; native reading disclosures share a compact heading/status/chevron row. Cooking keeps its immersive palette and uses `AppDialog` for finish confirmation. See [recipe workflow contracts](design/recipe-workflows.md).

## Pantry and shopping workflows

Pantry browsing and shopping overview use the wide shell; physical inventory uses the standard shell. Shopping detail retains its focused mobile header and dock. See [Pantry and shopping UI contracts](design/pantry-shopping-workflows.md) for counting drafts, live filters, shared catalog context, nonmodal panel placement and whole-trip review scope. Do not use filtered display rows to derive workflow completion.

## Meal planner

The planner keeps its focused desktop workspace and flowing mobile calendar. Its header uses compact shared hierarchy; calendar focus, setup range and generated snapshot scope are separate. Long planner surfaces use the shared modal lifecycle. See [meal planner UI contracts](design/meal-planner-workflows.md).

Nutrition's Today and Diary use the standard shell with one compact context toolbar. Recording and goal dialogs use shared headings with a scrolling body and reserved footer. See [Nutrition task surfaces](design/nutrition-workflows.md) for date, draft, feedback and portion contracts.

`AppDialog` accepts an optional `returnFocusRef` for deliberate task handoffs. Set its current element before closing the modal; the shared lifecycle returns focus to that latest destination, or to the opening control when no destination is supplied.

## Account and household settings

Both settings scopes use the same desktop rail and a single labelled section switcher below 900px. Keep route links and `aria-current`; Escape and selection close the mobile disclosure with predictable focus. Household overview names/order match navigation. Long settings pages use section anchors and named local save actions rather than another persistent mobile toolbar. See [settings workflows](design/settings-workflows.md) for recipient, draft and consequential-action boundaries.
