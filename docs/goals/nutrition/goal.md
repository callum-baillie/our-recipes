# Integrated Household Nutrition

## Objective

Implement the complete Nutrition feature described in the referenced brief as an integrated, household-shared part of Our Recipes: canonical and source-aware nutrient data, one nutrition profile per existing app/header profile, active-profile-focused personal views, shared household stats and charts, versioned goals, recipe calculations, planned and confirmed intake, immutable historical snapshots, accessible concise charts, deterministic insights, Pantry/grocery/meal-planner/recipe-card integration, migrations, tests, and documentation. Nutrition must not introduce a separate login, access ID, passphrase, session, or private-profile onboarding flow.

## Original Request

Add a top-level `Nutrition` page and complete the detailed integrated multi-person nutrition-management feature in Goal Mode. Inspect the repository first, preserve existing systems and behavior, create a concise implementation plan, then implement and verify the full outcome rather than stopping at planning, mock data, disconnected UI, or a partial calorie tracker.

The authoritative supplied brief is `C:/Users/Callum/.codex/attachments/3448dd1c-b1f2-4c59-a0b5-1eca707057a1/pasted-text-1.txt`.

## Intake Summary

- Input shape: `existing_plan`
- Audience: households using Our Recipes, including adult, dependent, and guest profiles already represented by the app's header profile selector, plus unassigned serving allocations
- Authority: `approved`
- Proof type: `demo`
- Completion proof: a fresh migrated development database and rendered end-to-end workflows prove exactly one Nutrition profile per existing app profile, no Nutrition-specific authentication or credentials, active-header-profile Your Nutrition focus, mutually viewable shared household charts/stats, canonical recipe nutrition and scaling, uneven planned serving allocations, cooking distinct from consumption, immutable historical snapshots, Food Diary totals, versioned goals, accessible concise charts, deterministic data-quality-aware recommendations, and correct separation of Pantry availability from intake, while all applicable repository gates pass.
- Goal oracle: current migrations plus focused domain/integration tests, full repository quality gates, and rendered Playwright walkthroughs of the individual, shared-household, Pantry/grocery, and incomplete-data workflows from the brief.
- Likely misfire: shipping a polished isolated calorie dashboard with a second Nutrition identity/login, duplicated people, mutable current recipe values, missing shared household visibility, equal serving assumptions, or Pantry/planned-food totals presented as consumed intake.
- Blind spots considered: Pantry is currently an active separate goal and must be treated as an evidence-dependent integration seam; existing app profiles are convenience identity rather than security boundaries, and the latest owner decision deliberately makes household Nutrition mutually viewable while preserving ActorContext attribution; personalized reference targets require authoritative versioned data and careful missing-sensitive-data behavior; the broad brief may exceed one safe migration/UI slice; health and regulated nutrient-content claims must remain out of scope; historical correctness, unit/density conversions, source conflicts, performance, timezones, and incomplete data can all yield plausible but wrong totals; Docker and real-device evidence must not be inferred.
- Existing plan facts: preserve the supplied brief except where superseded by the latest owner instruction; inspect current models and conventions first; use `/nutrition` and the existing navigation/design patterns; keep available, planned, prepared, assigned, and consumed food distinct; create exactly one Nutrition profile per existing app/header profile; use the active header profile for Your Nutrition focus; make household Nutrition profiles, chats, stats, and charts mutually viewable; remove Nutrition-specific login, access ID, passphrase, signed session, start-private-profile and separate profile-creation flows; preserve ActorContext for mutation attribution and exact trusted-origin checks; normalize nutrient definitions, reference values, sources, food records, calculations, snapshots, allocations, consumption, goals, measurements, and insights without duplicating core people/recipe/ingredient/planner/Pantry models; version references, goals, calculations, and historical snapshots; calculate recipes from quantities using only supported conversions; integrate recipe cards, planner, Pantry, groceries, cooking, Food Diary, shared household views and deterministic recommendations; test the complete acceptance matrix; do not implement future wearable, clinical, barcode, receipt, restaurant-provider, or AI-photo integrations unless suitable infrastructure already exists.

## Goal Oracle

The oracle for this goal is:

`On a fresh migrated development database, household members can complete the four supplied end-to-end workflows—individual tracking, unevenly allocated shared meal, Pantry/grocery/cooking integration, and incomplete-data logging—using only existing app/header profiles, with exactly one Nutrition profile per app profile, no Nutrition-specific authentication or credentials, active-profile-focused Your Nutrition, mutually viewable shared household stats/charts, correct consumed versus planned totals, versioned goals, source/confidence/completeness, immutable historical snapshots, accessible concise charts, and deterministic non-medical recommendations, with existing behavior preserved and pnpm format:check, lint, typecheck, unit, integration, OpenAPI, production build, focused E2E/accessibility, and relevant migration/database checks passing.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, schema scaffolding, a standalone dashboard, or passing isolated calculations are not enough. The goal finishes only when a final Judge/PM audit maps current receipts and verification back to the complete oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuous execution through the full requested Nutrition outcome. First validate and operationalize the supplied plan, then map the actual repository and Pantry dependency state, select an architecture that preserves current seams, and deliver successive coherent vertical slices across domain/migrations, recipe nutrition, profiles/permissions/goals, meal allocation and immutable consumption, Nutrition UI and charts, cross-feature integrations and recommendations, and final full-oracle verification.

## Non-Negotiable Constraints

- Keep browser code out of SQLite, filesystem, backup, and provider credentials.
- Treat existing household profiles as convenience identity, never as access control. The active header profile selects Your Nutrition; all household Nutrition profiles and details are mutually viewable by product design. Do not add Nutrition authentication, access IDs, passphrases, private-profile onboarding, permission grants, or a parallel profile selector. Preserve server-side validation, exact trusted-origin mutation checks, and signed ActorContext attribution.
- Preserve the signed `ActorContext` seam for audit/history behavior and validate every HTTP input with exact trusted-origin checks on mutations.
- Do not request unnecessary sensitive information, infer sensitive properties, expose hidden diary data, or make diagnostic, clinical, disease-prevention, or unsupported regulated nutrient-content claims.
- Never make a live OpenAI call without a credential gate and explicit paid-call permission; use deterministic non-AI insights and deterministic mocks in tests.
- Extend Drizzle migrations rather than rewriting applied migration SQL. Preserve existing recipe, profile, planner, grocery, and Pantry data and behavior.
- Keep Pantry availability, planned intake, prepared food, serving assignment, confirmed consumption, nutrition calculations, historical snapshots, targets, references, and estimates as distinct concepts.
- Historical consumption and goal context must remain stable after later recipe, ingredient, source, formula, reference, or goal edits; corrections must be explicit and auditable.
- Use trusted server-side reusable calculations. Reject invalid negative values, unsupported conversions, and volume-to-weight conversion without explicit ingredient density or conversion metadata.
- Preserve nutrition source, verification, confidence, completeness, assumptions, calculation method, and version metadata. Do not silently merge incompatible records or overwrite manual/clinician goals with updated references.
- Planned meals are never consumed automatically; cooking does not imply consumption; Pantry deduction and consumption are related but independently confirmed and idempotent.
- Keep the Overview concise and neutral. Reuse existing visual language, responsive/accessibility patterns, and component conventions. Avoid wall-of-chart, gauge, red/green-only, moralizing, or opaque primary health-score UX.
- Do not claim Docker, PWA, backup, Unraid, real-device, external provider, or current-authoritative-reference completion without direct evidence.
- Do not leave core production behavior as mock data, disconnected UI, placeholder services, or TODO comments.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated. Do not stop after one vertical slice while required Nutrition behavior remains. When a specific external reference, credential, environment, destructive operation, or human decision is unavailable, record that task truthfully and continue every safe local slice.

## Slice Sizing

Use the largest safe useful vertical slice. Each Worker package must be bounded by explicit files, verify commands, and stop conditions, but should deliver meaningful working behavior across the appropriate domain/API/UI/test seam rather than isolated tables or helpers. Review at architecture, sensitive authorization, migration/historical-integrity, cross-feature calculation, UX/accessibility, and final-completion boundaries.

## Board Health

Machine truth lives in `docs/goals/nutrition/state.yaml`. If this charter and the board disagree on task status, receipts, active work, verification freshness, or completion, the board wins.

## Canonical Board

Machine truth lives at:

`docs/goals/nutrition/state.yaml`

## Run Command

```text
/goal Follow docs/goals/nutrition/goal.md.
```

## PM Loop

On every continuation, read this charter and `state.yaml`, follow the installed GoalBuddy execution contract, work only on the active task, record a compact receipt, keep the board valid, and continue to the next safe slice until a final Judge audit proves the complete owner outcome.
