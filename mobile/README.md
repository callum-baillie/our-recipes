# Bòrd Mobile

Native Expo companion for Bòrd, built from the repository's `bord_expo_ios_mockup_pack` without changing that pack.

## Run

```powershell
cd mobile
npm install
npm run start -- --clear
```

Start with Expo Go (`npm run start`), then select iOS or Android. Use `npm run typecheck`, `npm run lint`, and `npm run test` before handoff.

## Architecture

- Expo Router with five native tabs (Recipes, Plan, Pantry, Nutrition, Lists) and independent stack-owned workflows. The header logo opens Home, while the avatar owns Settings, profiles, security, backups, and API access.
- Reusable token-based recipe, pantry, meal-plan, nutrition, shopping, settings, feedback, and glass primitives under `src/components/`.
- Startup instance discovery followed by Better Auth email/passphrase sign-in. The instance URL and native session cookies use SecureStore; account passphrases are never persisted.
- Server-owned recipes, collections, tags, Pantry batches, meal plans, shopping lists, profiles, and Nutrition datasets are downloaded into an account-and-instance-scoped SQLite read cache. Bòrd refreshes on sign-in, pull-to-refresh, foreground resume, and every 15 minutes.
- Favorites, shopping completion, Pantry depletion, and meal-plan additions are written to the web instance first and then reconciled from the server.
- Expo Camera barcode lookup works in Pantry and shopping-list flows, with manual UPC/EAN entry as an accessible fallback. Image Picker and Document Picker provide native recipe-photo, multi-image, and PDF import.
- Design-pack food photography is copied into `assets/design-pack/` for native bundling; the supplied pack remains unchanged.

## Development build

Expo Go supports the primary app flow, SecureStore sessions, SQLite caching, Camera barcode scanning, haptics, native tabs, SF Symbols, native switches, and the regular system-material fallback. The app targets Expo SDK 54 to match the App Store Expo Go client. Liquid Glass is represented by restrained system material in this compatibility build.

An iOS development build is required to validate this app's own local-network and camera permission wording, Face ID-gated SecureStore access, and any future SDK-55+ SwiftUI or Liquid Glass controls. Expo Go intentionally uses a persistent secure session without biometric gating.

## Mobile refinement pass

- Meal planning supports all seven days, previous/next weeks, recipe search, custom meals, servings and notes, rescheduling/editing, removal, copying a week, and a pantry-aware shopping list for the visible week. Recipe detail can preselect a recipe in the planner.
- Recipe edits preserve server metadata, unchanged structured ingredient quantities, equipment, named sections, and optimistic revision checks. A form retains its opening revision through background refreshes. Duplicate uses the server's duplication workflow.
- Recipe details expose source information, equipment, kitchen notes, revision history, native text sharing, and scaled ingredients added to a new or existing shopping list. Partially completed list writes are reported explicitly.
- Nutrition's day selector filters the latest intake revision for each meal in the profile timezone. Deleted/skipped entries are excluded and missing nutrient values remain unknown. The household comparison is labeled separately from daily intake.
- Cookbook search defers expensive filtering, offers alphabetical/time sorting, and bounds virtualized rendering. Native cache operations use asynchronous SQLite and coalesce writes; background refreshes are bounded and stale account responses are discarded.

Validation commands: `npm run typecheck`, `npm run lint`, `npm test`, and `npx expo export --platform ios --platform android --output-dir /tmp/bord-mobile-export`.

Native bundle export is not a device test. Validate camera, photo/document picking, keyboard layouts, VoiceOver/TalkBack, text scaling, offline recovery, and account switching on connected iOS/Android devices before release. See [web parity coverage](docs/web-parity.md) for implemented workflows, remaining differences, and validation boundaries.

## Web parity workspaces

- Recipes: archive/trash restoration, revision restoration, personal rating and notes, metadata and photo editing, ingredient-based nutrition calculations, and PDF/JSON/Markdown exports.
- Planner: recipes, individual foods, takeout, custom meals and leftovers; planned recipe variations; swaps, snapshot refresh, meal status and cooking from the planned recipe snapshot.
- Nutrition: revision-aware diary corrections, copy/move/reassign/delete/restore, product/recipe/manual intake, prepared meal yields and portions, goals, measurements, product nutrition record history and profile exports.
- Pantry and Lists: batch actions and history, storage locations, shopping-list lifecycle and item editing, purchase intake, store/aisle configuration and shared preferences.
- Native document sharing and printing use Expo adapters. Cooking and shopping can keep the screen awake only while focused. Searchable selectors render in batches.

The matching web server must include the `workspace` field in the prepared-recipes GET response from this change. The existing `preparedRecipes` response field is retained.

The Explore & export screen adds advanced server filters and multi-recipe PDF/ZIP selection. Nutrition now includes energy-estimate preview/apply, body-composition records, recipe-suggestion feedback and preparation from completed cooking sessions. Pantry includes grouped inventory and shared ingredient mappings. Matching server read routes are listed in the parity coverage document.
