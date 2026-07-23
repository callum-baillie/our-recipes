# T004 foundation receipt

Implemented the additive Pantry foundation without changing applied migration SQL or the existing recipe, planner, shopping-list, and cooking behavior.

## Delivered

- Canonical products, aliases, future identifiers, ingredient mappings, nested storage locations, physical batches, and immutable inventory events in migration `0015_pantry_inventory.sql`.
- Count/mass/volume unit registry with dimension-safe conversions; exact and approximate stock remain distinct.
- Expiry precedence and opened-shelf-life derivation.
- Transactional product/location/batch services with batch versions, stale-write conflicts, FEFO compatible deductions, attributed before/after events, and append-only one-step undo.
- Trusted-origin and signed active-profile mutation APIs. Reads remain household-wide; profiles remain attribution/preferences rather than access control.
- Responsive `/pantry` surface with summary, search, saved views, sorting, add flow, locations, expiry/status cards, consumption, open/empty actions, undo, and recent history.
- Focused unit/integration coverage plus API, data-model, and ADR documentation.

## Evidence

- Fresh isolated migration: `pnpm db:migrate` and `pnpm db:check` passed against `.test-data/pantry-migration-5140c19112a34a84b240c8e38d2e6d20.db`; the normal household database was not touched.
- Pantry unit suite: 5 passing tests.
- Pantry service suite: 4 passing tests covering canonical-vs-batch storage, attributed events, FEFO deductions, optimistic conflicts, undo, and location archive safety.
- Full suite: 90 unit and 34 integration tests passed.
- Lint, TypeScript, OpenAPI validation, production build, targeted formatting, and `git diff --check` passed.
- Build includes `/pantry` plus all Pantry endpoints. The existing backup-service Turbopack trace warning remains unrelated.

## Review boundary

The full outcome is not complete. Recipe availability, projected meal demand, grocery shortage/override/purchase intake, cooking confirmation/deduction, leftovers, and browser acceptance remain required. A migration/data-integrity Judge review is next.
