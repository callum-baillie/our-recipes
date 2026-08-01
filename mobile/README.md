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
