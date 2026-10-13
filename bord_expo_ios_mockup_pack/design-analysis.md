# Design Analysis and iOS Translation

## Source inventory

The supplied archive contains 64 screenshots: mobile and desktop views for 32 distinct pages. The covered product areas are authentication and account security, recipe discovery and authoring, cooking mode, pantry, meal planning, nutrition, shopping lists, the kitchen assistant, offline state, and ten settings surfaces.

## What should remain recognizable

### Distinctive strengths

1. **A clear editorial identity.** The combination of warm paper, high-contrast serif headings, dark forest ink, muted sage, and terracotta is more memorable than a generic utility-app aesthetic.
2. **A coherent household model.** Recipes, pantry, planning, nutrition, lists, and assistant features already feel like parts of one product rather than separate tools.
3. **Good verbal tone.** The interface language is calm, practical, and household-oriented.
4. **Useful depth.** The source set covers complete workflows rather than only marketing-style dashboard screens.
5. **Strong food imagery.** Photography is used as a navigational cue rather than decoration alone.

These characteristics are retained throughout the mockups.

## Main issues in the source mobile layouts

### 1. The desktop shell is compressed rather than reinterpreted

The repeated hamburger, centered wordmark, assistant button, and avatar consume a large share of the narrow header. Users then need a second row of page-specific tabs or filters, producing stacked chrome before the actual task begins.

**iOS translation:** replace the global hamburger model with five persistent native tabs and stack navigation. Keep the wordmark on brand-heavy root screens; use standard back navigation and concise titles deeper in a flow.

### 2. Editorial headings often overpower functional pages

Large display headings work well on Home and Recipes, but the same scale appears on dense settings, inventory, and transactional pages. On a phone this delays access to the controls the user opened the page to use.

**iOS translation:** preserve large editorial titles for root destinations and recipe storytelling. Use compact stack titles and smaller page introductions for settings, forms, detail views, and repeated workflows.

### 3. Primary actions are not consistently thumb-reachable

Several actions sit near the top of long pages or appear among similarly weighted bordered buttons. On task-heavy screens such as recipe creation, cooking, planning, and shopping, the next action should remain clear while the user scrolls.

**iOS translation:** use bottom toolbars or safe-area action bars for Save, Next step, Generate plan, Done shopping, and Create draft. Use navigation-bar actions for lightweight commits such as Edit or Save when the whole screen is a native form.

### 4. Custom web controls replace familiar platform behavior

Many settings resemble hand-built cards and rows, but they do not visually promise standard iOS behavior such as disclosure navigation, switches, pickers, swipe actions, context menus, and sheets.

**iOS translation:** settings become inset-grouped sections. Boolean settings use native switches. Selectors push a detail screen or open a native picker. Destructive actions are separated and use confirmation dialogs.

### 5. Dense borders and nested cards compete for attention

The source uses many bordered boxes inside other bordered boxes. This is legible on desktop but visually heavy on mobile and makes every region look equally important.

**iOS translation:** reduce the number of visible containers. Use spacing, section labels, list separators, typography, and subtle material changes before adding another border.

### 6. Some information is too small to survive Dynamic Type

Tiny uppercase labels, metadata, helper text, and compact pills are visually attractive at one fixed size but may become unreadable or wrap unpredictably for accessibility text sizes.

**iOS translation:** keep uppercase labels secondary, never essential; allow metadata to wrap; use system text styles; keep at least 44-point interactive targets; and test every screen at accessibility text sizes.

## Design concept

### Editorial cookbook, native operating system

The app should feel as though Bord belongs on iOS rather than as though the website has been placed inside a phone frame.

The **brand layer** contains:

- Warm paper background.
- Forest ink.
- Sage and olive accents.
- Terracotta primary actions.
- Teal profile identity.
- Serif display type for emotional or editorial moments.
- Food photography with restrained crops and continuous corners.

The **system layer** contains:

- Native tab navigation.
- Native stack transitions and back behavior.
- Native search fields.
- Native switches, pickers, menus, alerts, and sheets.
- System body typography and tabular numerals.
- Haptics and platform-standard motion.
- Dynamic Type, VoiceOver, contrast, reduced-motion, and reduced-transparency support.

## Liquid Glass policy

Liquid Glass is used only where a translucent adaptive layer helps users understand navigation or interaction:

- Primary tab bar.
- Floating navigation buttons over recipe photography.
- Sticky cooking, planning, capture, and shopping action bars.
- Compact transient controls such as search/filter toolbars.
- Form-sheet backgrounds where the operating system supplies the treatment.

It is not used for:

- Recipe reading surfaces.
- Ingredient lists.
- Long settings groups.
- Nutrition charts.
- Pantry rows.
- Food cards.
- Large decorative panels.

Those surfaces remain opaque or use restrained system materials so content stays legible and the glass hierarchy remains meaningful.

## Proposed information architecture

### Primary tabs

1. **Home** - next meal, quick actions, recent recipes, household status.
2. **Recipes** - library, collections, tags, import, capture, creation, detail, edit, and cook mode.
3. **Plan** - focused day view with week navigation and generation actions.
4. **Pantry** - stock, expiry, locations, scanning, and product detail.
5. **Lists** - active, planned, and completed shopping lists.

### Secondary destinations

- **Nutrition** opens from Home, profile, or meal context.
- **Kitchen assistant** opens from a toolbar action and preserves context from the current page.
- **Settings** opens from the profile/avatar menu.
- **Security** sits under Settings and Account.
- **Offline** is a system state, not a persistent destination.

## Screen-by-screen translation

| # | Screen | Native presentation | Main design change |
|---:|---|---|---|
| 01 | Sign in | Authentication stack | Compact branded card, one primary action, passkey promoted as a native alternative. |
| 02 | Forgot password | Pushed auth screen | One-field recovery flow with secondary local-recovery route. |
| 03 | Reset password | Pushed auth screen | Recovery code and password strength stay visible without a multi-panel desktop form. |
| 04 | Account security | Inset-grouped settings | Security status, sign-in methods, and trusted devices become native rows and switches. |
| 05 | Home | Root tab | Editorial welcome remains, but the next meal and quick actions move into thumb-friendly cards. |
| 06 | Recipe library | Root tab with native search | Two-column recipe grid, compact scope chips, native filter action. |
| 07 | Collections | Pushed recipe screen | Collections become visual cookbook shelves with stacked previews. |
| 08 | Tags | Pushed recipe screen | Searchable rows with counts, color identity, and disclosure behavior. |
| 09 | Import recipe | Pushed screen or form sheet | Camera, Photos, document, and URL sources become clear native entry points. |
| 10 | Capture notes | Full-screen compose flow | One large text surface, mode switcher, voice entry, and sticky draft action. |
| 11 | New recipe | Full-screen form | Progressive form groups with persistent draft/save actions. |
| 12 | Recipe detail | Pushed immersive detail | Photo-led hero, floating glass controls, compact metadata, dominant Cook action. |
| 13 | Edit recipe | Pushed native form | Dense editor reorganized into grouped fields with persistent save behavior. |
| 14 | Cook mode | Immersive task screen | Large step typography, progress, timer, and one-handed bottom controls. |
| 15 | Pantry | Root tab | Stock summary, native search, location scopes, expiry-first rows, floating Add action. |
| 16 | Meal planner | Root tab | Focused day view rather than a compressed desktop week; week strip remains immediately scannable. |
| 17 | Nutrition | Pushed dashboard | Profile/date context, confirmed intake, planned meals, and one actionable insight. |
| 18 | Shopping lists | Root tab | Active and planned lists become concise progress cards with one obvious create action. |
| 19 | Shopping list detail | Pushed operational screen | Search, scan, state segmentation, large rows, and a persistent completion bar. |
| 20 | Kitchen assistant | Contextual modal/full screen | Conversation is intentionally quiet; suggestions and composer sit near the bottom. |
| 21 | Offline | System state | Minimal recovery card with explicit offline availability. |
| 22 | Settings | Pushed root settings | Profile summary plus grouped destinations instead of a long custom settings page. |
| 23 | Profiles and roles | Pushed form | Active profile, members, role, units, and time zone use native forms and disclosure rows. |
| 24 | Recipe settings | Pushed form | Library defaults, creation behavior, and cook-mode options become grouped native settings. |
| 25 | Meal-plan settings | Pushed form | Planning defaults, shown meals, generation rules, and serving defaults are separated. |
| 26 | List settings | Pushed form | Store, completion, intake, and aisle order use rows, switches, and reorderable sections. |
| 27 | Pantry settings | Pushed form | Stock defaults, reminders, and scan behavior become concise groups. |
| 28 | Nutrition settings | Pushed form | Profile goals and optional personal inputs are explicit and separately permissioned. |
| 29 | AI settings | Pushed form | Model/privacy, assistant permissions, and confirmation behavior are visible at a glance. |
| 30 | System settings | Pushed form | Kitchen identity, icon, appearance, accessibility, and recovery are platform-aligned. |
| 31 | Backups | Pushed utility screen | Backup health, automatic policy, and manual recovery actions are separated by risk. |
| 32 | API and integrations | Pushed security screen | Key health, scoped keys, trusted integrations, and security policy are grouped clearly. |

## Interaction rules

- Recipe cards support long-press menus and previews.
- Pantry and shopping rows support swipe actions for consume, move, substitute, cannot find, and delete.
- Search is placed in native headers where it is the primary task; otherwise it appears as an inline field directly above results.
- Filters, sort, profile selection, serving changes, and secondary creation choices open menus or sheets rather than expanding the page.
- Destructive actions always require a system confirmation.
- Haptics confirm commits, shopping-state changes, timers, and cook-step progression; they are not used on ordinary scrolling or navigation.
- Offline changes are queued with a visible state and never presented as saved remotely until synchronization succeeds.

## Accessibility requirements

- Use semantic system text styles rather than fixed font sizes for body and control text.
- Preserve the serif font for display roles, but provide tested fallbacks and avoid serif text for small metadata.
- Support Dynamic Type through accessibility sizes without hiding actions or truncating essential names.
- Maintain at least 44 x 44 point interactive targets.
- Avoid communicating state by color alone; use labels, symbols, and shape changes.
- Respect Reduce Motion and Reduce Transparency.
- Provide VoiceOver labels, values, hints, and rotor-friendly headings.
- Use tabular numerals for timers, nutrition values, quantities, dates, and progress.
- Keep contrast sufficient on paper, sage, glass, and photographic backgrounds.
- Test keyboard and switch control navigation on iPad and external-keyboard configurations.

## Responsive behavior beyond the mockups

The phone mockups are the primary design target. On iPad or regular-width layouts:

- Recipe library can expand to three or four columns.
- Planner can show a week split view while retaining the focused-day detail.
- Settings can use a sidebar/detail layout.
- Shopping and pantry can use list/detail navigation.
- The assistant can appear as a resizable sheet or secondary column.
- The visual tokens should remain unchanged; only density and navigation structure should adapt.
