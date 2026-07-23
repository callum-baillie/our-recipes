# T019 historical-integrity and privacy-persistence decision

## Decision

Approved. Migration `0016` matches the restored schema mappings; product and recipe facts append monotonically, require explicit latest-revision supersession, retain source/calculation identity, keep sparse values, and snapshot legacy recipe values. Fresh migration and full tests pass. The model can be copied into future intake snapshots without mutating source records.

The next package may add real Nutrition principals, private profiles, append-only permission grant/revocation versions, versioned goals, and immutable body measurements. It must not add HTTP routes or UI yet.

## Security boundary

- Nutrition principals authenticate with the existing versioned salted scrypt verifier. No plaintext secret, recovery answer, or session cookie value is stored.
- Access-version increments invalidate older signed sessions.
- Household `profiles` may be linked for display/attribution only; they never own or authorize private Nutrition data.
- Profile reads and mutations require an authenticated Nutrition principal and use the existing deny-by-default authorization function.
- Permission changes append a new version (including revocation); prior grants remain auditable.
- Goal versions and body measurements are immutable. Profile current settings use optimistic versioning and archival, with owner/guardian rules enforced server-side.
- Reference-derived goal IDs must support stable versioned string IDs such as the FDA reference-set IDs, not only UUIDs.

## Worker package

Allowed files:

- `src/lib/db/schema.ts`
- `drizzle/0018_nutrition_profiles_goals.sql`
- `drizzle/meta/_journal.json`
- `src/lib/domain/nutrition-profile.ts`
- `src/lib/services/nutrition-profile-service.ts`
- `tests/unit/nutrition-profile.test.ts`
- `tests/integration/nutrition-profile-service.test.ts`

Verification requires focused formatting/lint/tests, all Nutrition unit tests, full lint/typecheck/tests, fresh migrations, and scoped diff checks. Production build remains deferred if live `.next` processes persist.

Stop if shared schema/journal ownership changes, any applied migration would need editing, secrets would be logged/stored, household profile selection would become authorization, history would be overwritten, routes/UI/docs/credentials/live calls are required, or another file is needed.

Afterward, require a dedicated privacy/security Judge before HTTP endpoints or intake persistence.
