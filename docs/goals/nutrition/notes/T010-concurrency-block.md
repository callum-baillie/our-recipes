# T010 blocked by Pantry migration ownership

T010 began only after Pantry T004 was complete and Pantry T005 was still a read-only audit. During implementation, Pantry T005 rejected its first migration model and activated a repair Worker that reserved the same schema and migration journal plus a new additive `0016_pantry_integrity.sql` migration.

The Nutrition migration had already been created as `0016_nutrition_foundation.sql`. The Pantry Worker observed it and appended its own journal entry after it, so the SQL files no longer collide by tag and migration order remains deterministic. However, the shared `src/lib/db/schema.ts` and journal were concurrently owned, which triggered T010's stop condition.

To avoid breaking the Pantry Worker's typecheck, the PM withdrew the uncommitted Nutrition schema mapping, service, domain input, and integration-test files. The additive Nutrition SQL, its journal entry, decision document, and draft native documentation remain for a fresh Judge to audit after Pantry T007 finishes. No applied migration, persistent database, Pantry file, or unrelated dirty file was reverted.

The next Judge must inspect Pantry T007's final receipt and the combined fresh-migration order, then either approve restoring the Nutrition schema/service/test package against the settled schema or require an additive correction. It must not treat the partially retained SQL as a completed vertical slice.
