# Our Recipes — production self-hosted recipe manager

## Objective

Build **Our Recipes**, a complete, polished, production-quality self-hosted recipe manager for a household running on a local Unraid server. It must be usable through a verified Docker deployment, retain data across container recreation, and meet the supplied functional, security, documentation, accessibility, performance, testing, backup, PWA, and Unraid-release requirements.

## Original Request

Build a complete, production-quality, self-hosted personal recipe manager. Do not stop at research, planning, scaffolding, a mock interface, or a partial MVP; continue through the application, database, OpenAI features, tests, Docker image, Unraid packaging, documentation, and release verification.

## Intake Summary

- Input shape: `existing_plan`
- Audience: A private household using a local Unraid server
- Authority: `requested` for local implementation and local verification; no authorization to push, publish images, create pull requests, alter remote infrastructure, or make paid OpenAI calls
- Proof type: `demo`, supported by automated tests, Docker smoke and persistence checks, restore evidence, visual and accessibility inspection, and a final audit
- Completion proof: A newly deployed container can complete the stated end-to-end household workflow and every applicable quality gate and release criterion has receipt-backed passing evidence
- Goal oracle: A fresh Docker deployment using the documented Unraid-compatible configuration passes the release gates and supports the complete first-run, recipes, profiles, imports, cooking, planning, printing, backup/restore, and offline-read workflow without placeholders or known reproducible errors
- Likely misfire: Producing a polished scaffold, a mock-only experience, isolated components, or a subset of routes while claiming the complete deployable product is finished
- Blind spots considered: a strict OpenAI cost/credential gate; local profiles are attribution rather than access control; untrusted URL/file/archive handling; backup and migration safety; realistic 10,000-recipe performance; responsive/print accessibility; no implicit public exposure; and preservation of data across Docker upgrades/recreation
- Existing plan facts: The supplied specification mandates Next.js App Router, strict TypeScript, pnpm, shadcn/Radix, Tailwind, Drizzle with SQLite, Zod contracts, OpenAI SDK behind an `AiProvider`, Sharp-class image processing, Vitest, Playwright, accessibility checks, PWA, versioned REST/OpenAPI, Docker/Unraid, documented deployment, backup/restore, and comprehensive release validation. It defines shared recipes with non-authenticated household profiles; structured recipe data with revision history; URL/text/photo/PDF imports that always require review; optional AI normalization and generation with local image storage; FTS search; safe scaling/conversion; cooking mode; meal plans and shopping lists; printing; secure LAN-oriented behavior; WCAG 2.2 AA; and a warm, editorial, non-corporate interface.

## Goal Oracle

The oracle for this goal is:

`Starting from an empty data volume, a fresh documented Docker deployment completes the end-to-end household recipe workflow and every required release gate has current, receipt-backed passing evidence.`

The PM must compare every task receipt to this oracle. Discovery, a passing small test suite, successful scaffolding, or a clean-looking board is not enough. The goal only finishes after a final Judge/PM audit maps the completed receipts and verification evidence to the original release acceptance criteria and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuously execute the supplied production specification. First validate the existing plan against the empty repository and current maintained dependencies, complete the required competitive and technical research, then implement the largest safe verified packages in dependency order. Continue through release verification rather than treating an early vertical slice as the finish line.

## Non-Negotiable Constraints

- Preserve unrelated future user work; do not perform destructive Git operations, push branches, publish images, create pull requests, or alter remote infrastructure without explicit authorization.
- Use the prescribed foundation unless current official documentation identifies a material compatibility or security reason to choose an alternative; record that decision in `docs/decisions/`.
- Keep business logic out of React components and route handlers. Maintain boundaries across UI, routes, contracts, services, repositories, providers, import parsers, image storage, and long-running operations.
- Treat household profiles as non-authenticated attribution and preference identities; show the no-access-control warning and keep an `ActorContext` seam for future real authentication.
- Do not inspect, expose, log, commit, or send an OpenAI key to browser code. Before any code path, configuration, or live test that can call OpenAI, safely check for a usable key and ask whether to reuse or securely create one. Live paid calls require separate explicit approval and remain limited as specified.
- All normal automated OpenAI tests use deterministic sanitized mocks. Never silently save or overwrite AI-derived recipe data.
- Keep data in the configured persistent `DATA_DIR`; make migrations, backups, restores, uploads, generated images, archive extraction, URL imports, and image transformations safe against untrusted input.
- Bind the container appropriately for Unraid while documenting that `AUTH_MODE=none` must never be exposed directly to the public internet.
- Deliver the complete requested product: shared recipe management, imports, AI-assisted review, images, scaling, search, cooking, planning, shopping, print, PWA/API, security, accessibility, performance, Docker/Unraid, recovery, documentation, and verified release gates.
- The interface must feel like a warm, contemporary cookbook or kitchen journal—not a generic dashboard or unchanged shadcn template—and must be checked at desktop, tablet, mobile, light/dark, and US Letter/A4 print surfaces.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, research, scaffolding, a mocked route, a single vertical slice, or a blocked credential-dependent live test while safe mocked and local work remains. If an exact human approval is the only remaining blocker and no safe local work remains, preserve the required reply in a blocked receipt, set `waiting_for_user_approval: true`, set `goal.status: blocked`, and set `active_task: null`.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny. Each Worker task should complete a coherent useful package—such as the production foundation, recipe-domain vertical slice, import-and-review flow, cooking/planning experience, or release packaging—and a Judge should review the package as a whole.

## Board Health

Machine truth lives at `docs/goals/our-recipes/state.yaml`. If this charter and that board disagree, the board wins for task status, receipts, verification freshness, and completion truth.

Run this when the board needs validation:

```text
node C:/Users/Callum/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.0/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/our-recipes
```

## Run Command

```text
/goal Follow docs/goals/our-recipes/goal.md.
```

## PM Loop

On every `/goal` continuation: read this charter and the GoalBuddy execution contract, read `state.yaml`, work only on its active task, record a compact receipt, update board truth, and advance to the next largest safe useful package. Review at research, architecture, risk, failed-verification, and final-completion boundaries—not after every tiny change.
