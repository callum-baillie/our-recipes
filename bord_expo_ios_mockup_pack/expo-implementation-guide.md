# Expo Implementation Guide

## Product target

Build one Expo codebase with an iOS-first interaction model and an Android-native adaptation. Do not reproduce the website as a fixed responsive canvas. Reuse domain logic, data contracts, and brand tokens; rebuild navigation and controls with native mobile patterns.

## Recommended stack

- **Expo Router** for file-based navigation, stacks, tabs, sheets, deep links, and route-level presentation.
- **React Native and Expo primitives** for lists, scrolling, images, gestures, safe areas, and platform-independent layout.
- **Expo Router native tabs** for the five primary destinations when the selected SDK version and project tolerance fit the current API status. Keep a conventional tab implementation available behind an abstraction because the native-tabs API can change.
- **`@expo/ui/swift-ui`** for selectively embedded SwiftUI controls or compositions that materially improve iOS fidelity. Avoid building the entire app as one SwiftUI host tree unless there is a measured benefit.
- **`expo-glass-effect`** for iOS 26 Liquid Glass navigation and action surfaces, with an opaque or blur fallback for older iOS and Android.
- **`expo-image`** for recipe and food imagery, caching, transitions, and SF Symbol sources where appropriate.
- **`expo-haptics`** for explicit confirmation events.
- **`react-native-reanimated`** for state transitions, expanding regions, matched changes, and reduced-motion-aware animation.
- **`react-native-gesture-handler`** for swipe actions and deliberate interactive gestures.
- **`expo-secure-store`** for secrets and short-lived device credentials; do not store API keys or authentication material in ordinary async storage.
- **`expo-local-authentication`** for device-authentication gates where appropriate. Passkey support should use the authentication architecture chosen for the backend rather than being simulated as a local biometric toggle.
- **`expo-sqlite`** or an equivalent durable local store for offline recipe, pantry, plan, and shopping data.
- **TanStack Query or an equivalent server-state layer** for caching, mutation state, retries, optimistic updates, and synchronization.

## Navigation architecture

A conceptual Expo Router structure:

```text
app/
  _layout.tsx                    Root providers and authentication gate
  (auth)/
    _layout.tsx                  Authentication stack
    sign-in.tsx
    forgot-password.tsx
    reset-password.tsx
  (app)/
    _layout.tsx                  Main native tabs
    (home)/
      _layout.tsx                Home stack
      index.tsx
      nutrition.tsx
    (recipes)/
      _layout.tsx                Recipe stack
      index.tsx
      collections.tsx
      tags.tsx
      import.tsx
      capture.tsx
      new.tsx
      [recipeId]/index.tsx
      [recipeId]/edit.tsx
      [recipeId]/cook.tsx
    (plan)/index.tsx
    (pantry)/index.tsx
    (lists)/
      _layout.tsx
      index.tsx
      [listId].tsx
    assistant.tsx                Contextual modal or full-screen route
    settings/
      _layout.tsx
      index.tsx
      profiles.tsx
      recipes.tsx
      meal-plan.tsx
      lists.tsx
      pantry.tsx
      nutrition.tsx
      ai.tsx
      system.tsx
      backups.tsx
      api.tsx
      security.tsx
  offline.tsx                    Routed state or root overlay
```

Exact grouping can change, but each root tab should own its own stack so users retain navigation history when switching tabs.

## Native component policy

### Use the operating system for

- Navigation bars and back behavior.
- Tabs.
- Search fields in headers.
- Switches, pickers, segmented controls, date/time pickers, menus, context menus, alerts, and confirmation dialogs.
- Form sheets and full-screen presentations.
- Keyboard avoidance and safe-area adjustment.
- Scroll-edge appearance and large-title collapse.
- Haptics and accessibility semantics.

### Use branded custom components for

- Recipe cards.
- Food photography and recipe heroes.
- Editorial section introductions.
- Pantry and list quantity visualization.
- Nutrition rings and macro bars.
- Cooking step cards.
- Collection stacks.
- Empty, offline, and assistant guidance states.

## Suggested shared components

```text
components/
  brand/
    bord-mark.tsx
    editorial-heading.tsx
    paper-surface.tsx
  navigation/
    app-tab-bar.tsx              Abstraction over NativeTabs/fallback
    glass-action-bar.tsx
    profile-menu.tsx
  recipes/
    recipe-card.tsx
    recipe-grid.tsx
    recipe-hero.tsx
    ingredient-row.tsx
    cook-step-card.tsx
  pantry/
    pantry-row.tsx
    stock-badge.tsx
    expiry-status.tsx
  planning/
    date-strip.tsx
    meal-card.tsx
  lists/
    shopping-row.tsx
    list-progress-ring.tsx
  nutrition/
    nutrient-ring.tsx
    macro-bar.tsx
  settings/
    settings-section.tsx
    settings-row.tsx
    settings-status-card.tsx
  feedback/
    empty-state.tsx
    offline-state.tsx
    sync-state.tsx
```

Keep route files thin. Fetch data, bind actions, and compose screen-level components in the route; keep reusable domain UI outside the `app` directory.

## Screen implementation map

| Screen | Recommended Expo/native pattern | Notes |
|---|---|---|
| Sign in | Stack, keyboard-aware ScrollView, secure fields, system credential action | Keep recovery links as secondary text actions. |
| Forgot/reset | Pushed auth routes | Do not use a modal alert for multi-step recovery. |
| Security | SectionList or native form sections | Trusted devices push device detail; sign-out-all is destructive. |
| Home | ScrollView plus horizontally adaptive cards | Keep profile and assistant in toolbar actions; no hamburger. |
| Recipes | FlatList with two columns, native header search | Preserve scroll position and search state when switching tabs. |
| Collections | FlatList, link previews, context menus | Long press offers rename, share, reorder, and delete. |
| Tags | SectionList/FlatList and inline or header search | Use swipe/context actions for rename and merge. |
| Import | Form sheet or pushed chooser | Use camera, image picker, document picker, and URL form routes. |
| Capture | Full-screen compose route | Bottom action bar adjusts above keyboard and supports dictation. |
| New/edit recipe | ScrollView with grouped form sections | Autosave draft; expose validation near the affected field. |
| Recipe detail | Collapsing image header or custom hero under stack | Use glass only for over-image controls and sticky action surfaces. |
| Cook mode | Immersive pushed route | Keep screen awake, use large targets, timer integration, and explicit exit confirmation. |
| Pantry | FlatList with sticky search/filter region | Swipe actions for consume, move, edit, and delete. |
| Plan | Horizontal day strip plus vertical meal list | Open meal choice and generation settings in sheets. |
| Nutrition | ScrollView/SectionList | Clearly label confirmed, estimated, and planned data. |
| Lists | FlatList | New list in sheet; preserve active/planned/completed filters. |
| List detail | SectionList grouped by aisle/category | Swipe and context actions; optional scan mode as full-screen task. |
| Assistant | Full-screen modal or resizable sheet | Pass current route context explicitly and show pending changes before commit. |
| Offline | Root overlay or dedicated route | Do not block access to cached content; show queued mutation state. |
| Settings | Native grouped list | Root rows push detail routes. |
| Settings detail screens | Native form/list sections | Use system switches and pickers; avoid custom toggles. |

## Liquid Glass implementation

Create one `GlassActionBar` abstraction with these behaviors:

1. On iOS 26 and supported hardware, render the native glass effect.
2. On older iOS, render a restrained blur/material with an opaque tint sufficient for contrast.
3. On Android, render a Material 3 tonal surface with elevation and no fake glass refraction.
4. Respect Reduce Transparency by switching to an opaque surface.
5. Keep the shape continuous and reserve it for navigation or controls.
6. Never place long-form text directly on a glass surface.

Good candidates in this pack:

- Bottom tab bar.
- Capture composer.
- New/edit save bar.
- Cook-mode controls.
- Planner action bar.
- Shopping completion bar.
- Over-image recipe controls.
- Assistant composer.

## Typography

- Use the app's editorial serif only for display headings, recipe names, and selected collection titles.
- Use the iOS system font for controls, settings rows, metadata, quantities, tabs, alerts, and long body copy.
- Map text to semantic roles such as largeTitle, title1, title2, headline, body, callout, footnote, and caption.
- Avoid fixed-height text containers.
- Use tabular numerals for timers, dates, progress, serving counts, nutrition, and quantities.
- On Android, use an equivalent serif display face and the system sans for functional UI.

## Color and materials

Read values from `design-tokens.json`; do not scatter raw color literals through routes.

- `background.paper` is the main warm canvas.
- `surface.primary` is used for cards and grouped rows.
- `ink.primary` is the default text and icon color.
- `accent.terracotta` is reserved for primary commits and high-attention scanning actions.
- `accent.olive` communicates selection, success, and household organization.
- `accent.teal` identifies a person/profile rather than a general success state.
- Semantic colors must remain distinct from brand accents and meet contrast requirements.

## Data and offline model

The app's value depends on household data remaining usable in a kitchen, store, or campsite with weak connectivity.

- Cache recipe detail, images, pantry summaries, current plan, active lists, and cook-mode steps.
- Store local mutations in a durable queue with idempotency keys.
- Distinguish `local`, `syncing`, `synced`, and `conflict` states.
- Allow shopping and cooking workflows to continue offline.
- Surface conflicts at the item level rather than blocking the whole app.
- Never discard manually entered list or pantry changes during regeneration.

## Platform adaptation

### iOS

- Native tabs, stack headers, form sheets, context menus, link previews, haptics, and Liquid Glass where supported.
- Use scroll-edge behavior and safe-area-aware bottom controls.
- Consider Apple-style zoom transitions from recipe cards to detail only after standard navigation is stable and accessible.

### Android

- Keep route structure and visual identity.
- Use Material 3 navigation, sheets, menus, switches, and tonal surfaces.
- Use predictable Android back behavior.
- Do not imitate iOS glass, segmented controls, or navigation bars when Material equivalents are clearer.

## Accessibility and testing matrix

Every screen should be tested with:

- Small and largest accessibility text sizes.
- Light and dark appearance.
- Increase Contrast.
- Reduce Motion.
- Reduce Transparency.
- VoiceOver and TalkBack.
- Bold Text.
- 320-point compact width and modern large iPhone widths.
- iPad split view.
- Keyboard visible.
- Offline and delayed-sync states.
- Long recipe names, translated labels, large quantities, and empty data.

Automated checks should cover route reachability, accessible names, touch-target size, list recycling, state restoration, and screenshot regressions. Manual checks remain required for VoiceOver order, gesture alternatives, glass contrast over imagery, keyboard flow, and cook-mode ergonomics.

## Recommended implementation sequence

1. Establish tokens, typography, safe-area behavior, root providers, and route structure.
2. Build the five root tabs and shared stack/navigation abstraction.
3. Implement Home and Recipe Library to validate the brand-to-native balance.
4. Implement Recipe Detail and Cook Mode to validate immersive and glass treatments.
5. Implement Pantry, Planner, Lists, and offline synchronization primitives.
6. Implement native settings forms and authentication/security screens.
7. Add Assistant and Nutrition after permissions, data provenance, and mutation review states are explicit.
8. Add iOS 26 glass and optional advanced transitions only after functional and accessibility testing passes.
9. Adapt Android controls and navigation without changing product information architecture.
