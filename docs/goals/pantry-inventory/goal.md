# Pantry Inventory Layer

## Objective

Implement a production-quality Pantry inventory layer for Our Recipes that models reusable products separately from physical stock batches and integrates household inventory with recipes, meal planning, cooking, and grocery calculations without regressing existing behavior.

## Original Request

Add a top-level Pantry page and complete the feature end to end in Goal Mode, following the detailed Pantry brief in the referenced pasted text. Inspect the repository first, preserve working architecture and data, then implement migrations, domain services, APIs, UI flows, cross-feature integrations, tests, and documentation. Do not stop at planning or a partial MVP.

## Intake Summary

- Input shape: `existing_plan`
- Audience: households using Our Recipes on mobile, tablet, and desktop
- Authority: `approved`
- Proof type: `demo`
- Completion proof: a clean development database can migrate and the tested end-to-end household workflow can add and manage multiple pantry batches, calculate recipe and meal-plan coverage without double allocation, generate explainable grocery shortages with preserved overrides, add purchased groceries to inventory, and confirm FEFO cooking deductions with history, while all repository gates pass.
- Goal oracle: current migrations plus focused unit/integration tests, repository verification gates, and a rendered Playwright walkthrough of the complete Pantry-to-meal-plan-to-grocery-to-cooking workflow.
- Likely misfire: shipping a visually complete but isolated pantry CRUD page whose quantities are not trustworthy in recipe, meal-plan, cooking, and grocery calculations.
- Blind spots considered: the current ingredient model may be free-form; unit conversion may be limited; the meal planner may lack cooked/skipped states; household profiles are convenience rather than access control; the broad brief requires phased vertical slices without silently deferring core acceptance criteria; Windows formatting noise and unavailable Docker/device runtimes must not be presented as feature failures or false acceptance.
- Existing plan facts: preserve the user's complete brief as authoritative scope; inspect architecture before implementation; validate the existing canonical ingredient, household, ActorContext, unit, meal-plan, grocery, API, UI, migration, and test seams; implement reusable product definitions, physical inventory batches, locations, history and undo, expiry semantics, recipe mapping and coverage, projected meal demand, explainable grocery shortages, confirmed cooking deductions, staples, purchased-item intake, future product identifiers, documentation, and all specified acceptance tests; do not implement barcode scanning or a notification-delivery framework.

## Goal Oracle

The oracle for this goal is:

`On a fresh migrated development database, an authenticated household can complete the tested and rendered workflow Pantry add/manage -> recipe availability -> multi-meal projected demand -> explainable grocery shortage and override -> purchased item added to Pantry -> confirmed FEFO cooking deduction and event history, with household isolation and trusted-origin/input validation intact, and pnpm format:check, lint, typecheck, unit, integration, OpenAPI, production build, focused E2E/accessibility, and relevant migration/database checks passing.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuous execution through the full requested Pantry outcome. First validate the supplied plan against the repository, then map architecture and baseline health, then deliver successive coherent vertical slices that keep the repository working: domain/migrations, inventory operations and history, Pantry UX, recipe availability, meal-plan projections and grocery math, cooking/purchase flows, and final cross-feature verification.

## Non-Negotiable Constraints

- Keep browser code out of SQLite, filesystem, backup, and provider credentials.
- Treat household profiles as a convenience feature, never as access control.
- Preserve the signed `ActorContext` seam for Pantry audit and history behavior.
- Validate every HTTP input and preserve exact trusted-origin checks on mutations.
- Never make a live OpenAI call without a credential gate and explicit paid-call permission; use deterministic mocks in tests.
- Extend Drizzle migrations; never rewrite applied migration SQL. Existing recipes, meal plans, and grocery lists must remain valid.
- Reuse the current canonical ingredient model if viable; otherwise preserve original recipe ingredient text behind a safe optional mapping layer.
- Keep product definitions distinct from physical inventory batches. Store multiple future product identifiers separately from batches; do not expose unfinished barcode UI.
- Support exact and approximate quantities, but only convert directly compatible units unless an explicit ingredient-specific conversion exists.
- Treat planned meals as projected demand, not physical consumption. Confirm cooking deductions and update inventory atomically with linked history.
- Preserve manual grocery overrides and make automatic demand, pantry coverage, staple replenishment, and final purchase quantities explainable without double counting.
- Do not add a notification-delivery framework; document future event/integration points.
- Use the existing visual language, components, accessibility, responsive, loading, empty, error, and recovery patterns.
- Do not claim Docker, PWA, backup, Unraid, real-device, or runtime acceptance without direct evidence.
- Do not leave core TODOs, disconnected production UI, placeholder paths, or mock-only production behavior.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated. Do not stop after a single vertical slice while required Pantry behavior remains. If a particular environment, credential, destructive operation, or human decision is unavailable, record that task truthfully and continue every safe local slice.

## Slice Sizing

Use the largest safe useful vertical slice. Each Worker package must be bounded by explicit files, verify commands, and stop conditions, yet should result in meaningful working behavior rather than isolated helpers. Review at architecture, migration/data-integrity, cross-feature calculation, and final-completion boundaries.

## Board Health

Machine truth lives in `docs/goals/pantry-inventory/state.yaml`. If this charter and the board disagree on status, task, receipt, verification freshness, or completion, the board wins.

## Run Command

```text
/goal Follow docs/goals/pantry-inventory/goal.md.
```

## PM Loop

On every continuation, read this charter and `state.yaml`, follow the installed GoalBuddy execution contract, work only on the active task, record a compact receipt, keep the board valid, and continue to the next safe slice until a final Judge audit proves the complete owner outcome.
