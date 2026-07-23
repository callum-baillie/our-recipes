# T024 immutable intake persistence

## Outcome

Added an additive normalized Nutrition intake layer without changing applied migrations or any Pantry, planner, cooking, API, UI, or documentation implementation files.

Meal allocation versions and diary revisions are separate append-only series. Planned, served, skipped, leftover, and eaten allocation states do not create diary intake. An eaten allocation can only link an already-created current eaten/corrected intake series for the same private Nutrition profile.

Eaten and corrected diary revisions freeze sparse nutrient amounts, per-value source IDs, confidence, completeness, estimated state, source detail metadata, source digest, calculation version, and portion basis. Skipped and deleted revisions contain no nutrient values or provenance totals. Corrections and deletions must supersede the latest revision and never update earlier rows.

All reads require `view_diary`; all writes require `manage_profile`, evaluated against the private Nutrition principal and latest permission versions. A diary-only viewer can read but cannot write; a guardian can write for a dependent profile.

## Evidence

- `drizzle/0019_nutrition_intake.sql`
- `src/lib/db/schema.ts`
- `src/lib/domain/nutrition-intake.ts`
- `src/lib/services/nutrition-intake-service.ts`
- `tests/unit/nutrition-intake.test.ts`
- `tests/integration/nutrition-intake-service.test.ts`
- Focused Prettier and ESLint: pass
- Focused Nutrition unit suite: 57 tests pass
- Focused intake integration suite: 4 tests pass
- Full `pnpm test`: 141 unit and 54 integration tests pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- Fresh isolated `pnpm db:migrate && pnpm db:check`: pass through 0019
- Scoped `git diff --check`: pass; only Windows line-ending notices

## Harness note

The exact GoalBuddy Worker exceeded the single-wait limit without returning and was interrupted before it wrote any T024 file. The PM fallback executed the exact bounded package and verification as permitted by the skill.
