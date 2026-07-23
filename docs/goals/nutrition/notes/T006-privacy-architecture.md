# T006 — Persistence, canonical product, and privacy architecture

## Decision

Approved with persistence deferred until the active Pantry migration package is reviewed. The exact GoalBuddy Judge exceeded the single-wait limit; PM completed this read-only fallback. The architecture adopts `pantryProducts` provisionally as the reusable food/product anchor, preserves batches as availability only, and requires a distinct local Nutrition principal credential/session before any sensitive detailed diary route exists.

## Persistence contract (approved for a later package)

- Add only the next append-only migration after Pantry's final journal state.
- Normalize nutrient definitions, reference values, data sources, food/product nutrition records and values, calculation versions, recipe calculations, Nutrition profiles/principals/permissions, goal versions, prepared instances, allocations, consumption items and immutable snapshots.
- Attach food nutrition to reusable `pantryProducts` when Pantry T004 is accepted. `recipeIngredientProductMappings` bridges current ingredient rows. Physical batches carry availability and lot provenance only; they do not hold or imply intake.
- Preserve current eight recipe values as legacy current per-serving records tied to recipe revision, labeled unknown/manual-or-estimated provenance, unverified and incomplete. Never infer a manufacturer, USDA, ingredient-calculated, or high-confidence source.
- Historical consumption snapshots copy nutrient values, portion, recipe/source/calculation version and goal version. Later edits never rewrite those rows.
- Source/reference seed rows require official attribution, jurisdiction, version and effective date. No authoritative target values will be invented in this privacy package.

## Authorization contract

- `ActorContext.profileId` remains attribution and UX selection, never authorization.
- A Nutrition principal authenticates locally with an explicit secret/access code stored only as a salted memory-hard hash. A signed, HttpOnly, expiring Nutrition session carries only a principal ID, credential/access version and time bounds.
- Profile ownership and owner/guardian/viewer grants are server-evaluated. Detailed diary, measurements, goal management, export and deletion are separate actions; default is deny. Household membership or a switchable profile never grants detailed access.
- Revocation increments the principal/access version so old sessions fail once a route compares claims with current persistence.
- Sensitive profile fields remain optional. Estimated-target mode requires explicit consent plus the formula's required inputs; manual goals work without sensitive inputs. Domain code validates but does not infer age, sex category, life stage, allergies or conditions.

## T007 Worker package

Implement the access and sensitive-domain contract in four new files only:

- `src/lib/nutrition-access.ts`
- `src/lib/domain/nutrition-profile.ts`
- `tests/unit/nutrition-access.test.ts`
- `tests/unit/nutrition-profile.test.ts`

Required behavior:

- Server-only salted `scrypt` credential hash/verify with a versioned bounded serialized format, constant-time derived-key comparison, safe malformed-input rejection and no secret logging.
- HMAC-signed base64url Nutrition session with fixed audience, principal ID, access version, issued/expiry times, bounded lifetime, future-skew/expiry validation and tamper rejection. Signing secret is injected and must be at least 32 characters.
- Zod schemas for optional sensitive Nutrition profile inputs, explicit estimated-target consent, measurement preferences, dietary preferences/allergies/exclusions, privacy/comparison settings, body measurements, and manual/reference/clinician goal versions.
- Estimated targets cannot be enabled unless consent and required formula inputs are explicitly supplied; manual goal use needs none of them.
- Pure permission evaluator for owner, guardian and granular viewer grants across diary, measurements, goals, comparison, export and deletion, with deny-by-default and expiry behavior.
- Tests for valid/invalid/tampered/expired credentials and sessions, default privacy, no implicit household/profile access, guardian and granular viewer behavior, optional sensitive fields, estimated-target gating, goal type/range/limit validation, goal history dates/states and measurement validation.

## Verification

- `pnpm exec prettier --check src/lib/nutrition-access.ts src/lib/domain/nutrition-profile.ts tests/unit/nutrition-access.test.ts tests/unit/nutrition-profile.test.ts`
- `pnpm exec eslint src/lib/nutrition-access.ts src/lib/domain/nutrition-profile.ts tests/unit/nutrition-access.test.ts tests/unit/nutrition-profile.test.ts`
- `pnpm typecheck`
- `pnpm vitest run --project unit tests/unit/nutrition-access.test.ts tests/unit/nutrition-profile.test.ts`
- `git diff --check -- src/lib/nutrition-access.ts src/lib/domain/nutrition-profile.ts tests/unit/nutrition-access.test.ts tests/unit/nutrition-profile.test.ts`

## Stop conditions

- Any need outside the four new files.
- Any need to modify config, cookies/routes, schema, migrations, Pantry or UI before the contract is verified.
- Any attempt to treat ActorContext or a switchable profile as authorization.
- Any invented medical/reference target or inferred sensitive property.
- Any live provider call, credential read, external write or paid action.
- Verification fails twice for a cause not fixable in scope.

## Next boundary

After T007, re-check the Pantry board. If its foundation and migration review are complete, use a high-risk Judge boundary for the normalized Nutrition persistence migration and legacy backfill. If Pantry is still active, continue with another non-overlapping server/domain slice only if it materially advances the full outcome.
