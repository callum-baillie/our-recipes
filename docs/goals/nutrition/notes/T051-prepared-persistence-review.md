# T051 prepared persistence and atomic command review

Approved the T050 persistence/API split with the following mandatory conditions.

- Add migration `0021` and matching schema/journal entries only; do not edit any applied migration.
- Prepared creation uses a stable client-provided UUID and canonical request digest so an identical retry returns the same immutable instance while conflicting reuse is rejected.
- A prepared instance freezes recipe, current matching recipe-calculation identity, actual serving yield, optional final weight, optional meal-plan and completed cook-session links, calculation-alignment/adjustment snapshot, actor and time.
- A supplied cook session must be complete and match the recipe and optional planned meal. Cooking and Pantry routes remain unchanged and create no Nutrition rows.
- Preparation adjustments not represented by the selected calculation must set a blocked state and cannot be used to record calculated consumption.
- Refactor intake/allocation appends into transaction-aware internals while preserving existing public routes. One explicit confirmation transaction must authorize, validate capacity and latest predecessor, server-build the immutable recipe snapshot, append intake and eaten allocation, and persist the idempotency result.
- An identical principal/key/digest retry returns the exact prior intake and allocation. Reusing a key with changed meaning is a conflict. Seconds use a new command and series; partial servings are supported.
- Intake and allocation gain prepared/planned/cook links without rewriting historical rows.

This Worker is not the complete user workflow. A following reviewed UI slice must expose prepared creation, portions, seconds, skips and leftovers, and a later calculation slice must add evidence-backed substitutions/exclusions beyond optional ingredients.

The exact GoalBuddy Judge exceeded the single-wait limit and was interrupted. The PM performed the same read-only approval gate as permitted fallback.
