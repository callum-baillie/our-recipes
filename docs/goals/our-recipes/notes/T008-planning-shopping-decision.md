# T008 — planning and shopping package decision

## Ranked gaps

1. **Plan-to-shop workflow:** the product has real recipes but cannot help the household decide what to cook or turn a plan into an editable shop list.
2. **Cooking execution:** scaling, focused cooking mode, and timers need the recipe model but can follow a plan/list workflow.
3. **Review-first capture/import:** high value but introduces URL/file/image/PDF/handwriting trust boundaries and needs a separately hardened package.
4. **Images, PWA, backups, Docker/Unraid:** each needs direct operational or security proof and should not be faked.

## Decision

T009 should implement the next complete safe household workflow: choose existing recipes for dates/meals in a weekly plan; view the plan; generate one editable shopping list by aggregating structured ingredients; check/reorder/remove/add list items; and preserve the plan/list across reloads. The plan-to-list action must be repeatable and transparent rather than silently overwriting user edits. The shared model should retain profile attribution for creation/editing without treating profiles as auth.

This package builds on the verified recipe graph without external fetching, uploads, AI, image processing, Docker, or credentials. Cooking mode/timers and richer unit scaling can build from the same normalized ingredient quantities next. Capture/import remains deferred until SSRF and untrusted-file controls are ready.
