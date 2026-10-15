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
