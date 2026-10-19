# Bòrd Batch 6 — implementation and verification

## What changed

Implemented the account and household settings refinement against checkout `c7e5433781fc8e34bcce2b600dd38eff485e8949`, preserving the earlier batch changes in the working tree. The screenshot archive does not establish its build SHA; the **before** images in this bundle are current-checkout captures taken before this batch's edits.

- **Shared settings:** one 900px navigation breakpoint, compact labelled mobile section navigation, aligned household destinations, consistent pane/field/disclosure hierarchy, accessible appearance/icon selection and form-owned saved snapshots, locks and local feedback.
- **Identity and members:** explicit linked-account recipient, regional choices, compact cooking context, named goal limits, member summaries with Add at the top, separate identity/access/archive actions, authoritative role/guardian metadata reconciliation, and bounded onboarding with keyboard-operable in-dialog type selection and protected security completion.
- **Nutrition preferences:** direct section access, canonical measurement drafts across unit changes, selected-first nutrient search and limits, validated timezones, authoritative saved-profile adoption, and estimate preview/application bound to saved inputs, date, activity, version and replay operation. Preference saving does not record weight or apply a goal.
- **AI, schedules and connections:** independent personal-default/privacy saves, named account-scoped summary outcomes and returned snapshots, explicit saved-policy/generation partial outcomes, no stale hidden processing writes from Schedules, persistent job action errors, review handoff, and account/action-specific integration feedback that distinguishes import from refresh failure.
- **Security and defaults:** focused password errors/reveal, compact passkey management, concise recipe/meal/Pantry defaults with natural numeric editing, custom meal-type preservation and acknowledged save state.
- **Stores and maps:** independent general/store drafts retained across selection, compact route rows, raw keyword editing, honest saved-version duplication/archive, free eligible cache lookup without paid consent, and local route import with Undo and a named-store save boundary.
- **System and credentials:** section navigation and provider-layer context, progressively revealed archive history, creation distinguished from validation, restore confirmation coupled to the currently validated target, guarded reset pending/error state, background configuration distinguished from job execution, readable key scopes and independent disabled/expired states, and protection against replacing an unacknowledged one-time secret.

Workflow contracts are documented in [`settings-workflows.md`](/home/callum/Documents/GitHub/our-recipes/docs/design/settings-workflows.md). No migrations, deployment or commit was performed.

## Checks performed

| Check | Actual result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed. |
| Scoped ESLint | Passed for Batch 6 source and tests. |
| Formatting | All 54 recorded Batch 6 paths passed Prettier. |
| Whitespace | `git diff --check` passed. |
| Focused unit tests | **84 passed across 9 files.** |
| Focused integration tests | **53 passed across 8 files.** |
| Responsive captures | **40 states:** 16 routes at desktop 1440 × 1000 and phone 390 × 844, plus Nutrition/Lists at 820px, 900px, 320px and short-height 200% CSS text. No document overflow or browser page errors were recorded. |
| Controlled browser workflows | **12 passed**, including radio/navigation keyboard behavior, Nutrition invalidation/conflict, onboarding errors/type popup/security acknowledgement, restore target invalidation/reset pending, API one-time result, integration refresh failure, task retry/review handoff, map cache/import Undo, independent AI saves, long backup review and filtered icon identity. |
| Automated accessibility | Eight affected pages scanned with axe WCAG 2 A/AA and 2.1 AA rules: **zero reported violations**. This is a limited automated check, not a complete accessibility certification. |

Unit coverage includes submitted-snapshot freezing, numeric blanks, custom meal types, regional validation, timezone schedule dates, canonical unit drafts, estimate invalidation and exact retries, selected nutrient retention, authoritative body-input adoption, explicit role actions/rollback, restore target invalidation, separate store/preference drafts, one-time key guards and local AI partial-outcome feedback. Service coverage includes schedule/AI scope, goal versions, household restrictions, list persistence, backup safeguards and key access contracts.

### Reproducible test commands

```sh
pnpm exec vitest run --project unit --maxWorkers=1 --no-file-parallelism --testTimeout=20000 \
  tests/unit/settings-refinements.test.ts \
  tests/unit/profile-settings-snapshot.test.ts \
  tests/unit/settings-summary-scope.test.ts \
  tests/unit/store-map-permission-boundary.test.ts \
  tests/unit/nutrition-components.test.ts tests/unit/nutrition-profile.test.ts \
  tests/unit/appearance.test.ts tests/unit/ai-settings-route.test.ts tests/unit/modal-focus.test.ts

pnpm exec vitest run --project integration --maxWorkers=1 --no-file-parallelism --hookTimeout=30000 \
  tests/integration/ai-account-settings.test.ts tests/integration/app-preferences-service.test.ts \
  tests/integration/nutrition-profile-service.test.ts tests/integration/nutrition-energy-estimate-service.test.ts \
  tests/integration/household-service.test.ts tests/integration/list-settings-service.test.ts \
  tests/integration/backup-service.test.ts tests/integration/api-key-access.test.ts
```

Results: [unit](unit-final-all.log), [integration](integration-final.log), [typecheck](typecheck-final.log), [lint](lint-final.log), [formatting](format-check-final.log), [viewports](after.json), [workflow checks](interactions.json), [map/reflow/accessibility](extra.json), [AI/long-review/icon checks](last-checks.json).

## Fixture and verification limits

Browser checks used an isolated development database and deterministic responses. Nutrition's deep review states used dummy saved body inputs; no real weigh-in/history observation was recorded. Consequential browser requests were mocked, with unexpected writes blocked. No live provider generation, scale sync, real account/key creation, restore or reset was used to inspect the UI. Integration tests exercise isolated service fixtures, not the live installation.

The Browser plugin was unavailable, so captures and keyboard checks used Playwright. Enable the Browser plugin for future interactive inspection. Short viewport and CSS text enlargement were checked; physical software keyboards, OS passkey prompts, assistive-technology announcements and every possible network timing were not exercised. Actual worker execution, provider billing/cancellation, deployment, Docker/PWA operation and installation recovery are not certified by this UI work. No release build was run.

## Captures

[Open the before/after and state gallery](index.html). It includes full-page desktop/mobile captures, narrower/intermediate/short-height views, and 28 controlled state captures covering the previously missing or changed forms. Debug failure images are excluded. The latest AI feedback, backup review and map handoff states were recaptured after their final changes.
