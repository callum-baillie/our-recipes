# Chat planning refinements

Chat offers structured clarifications through `ask_clarification`: 2–5 suggested answers with a custom answer, explicit Send, and the regular composer. Questions persist in validated message metadata and older questions become read-only. The questionnaire (`agent-questionnaire.tsx`) keeps GlasscowUI's agent-question prop and answer shapes but is a native component: lettered/numbered suggestion rows, a custom-answer row, `1`–`9` and arrow-key selection, Enter to send, a sending state, and a read-only "answered" summary once the conversation moves on.

The chat context includes the active profile's local date, timezone, current sharing flags and permitted household roster. Day-only ranges resolve to the next start date on or after today, rolling month/year forward. Explicit dates still take precedence. Pantry-driven requests instruct the assistant to inspect stock and saved recipes before drafting; sharing flags and pagination remain enforced.

Meal-plan previews show saved recipe links and generated recipe details. Replace-this-meal sends a scoped revision request. The revision tool checks profile/thread ownership and draft status, generates one replacement, merges it into the existing candidate, and atomically cancels superseded previews. Unselected entries, generated recipes, allocations, and conflicts remain unchanged. Linked leftover meals require a joint review. Confirmation remains necessary before saving recipes, meals, and the associated shopping list.

Stateless OpenAI chat requests include encrypted reasoning so tool continuations can carry reasoning items without server-side storage. Provider failures expose actionable status categories; diagnostic logs omit provider error messages and household input. No paid call is needed by the tests.

Tower inspection confirmed that Julia's identity sharing was disabled. Identity, pantry, and kitchen-equipment sharing were enabled for both existing profiles at the user's request; existing nutrition/metric sharing choices were retained. Code changes require a separate release to reach Tower. A live provider replay has not been run.

## Chat UI (refined)

The conversation surface is built from small native pieces in `src/components/chat-ui/` that follow GlasscowUI anatomy (ToolCall/ToolCallGroup, Skeleton, agent-question) but use this app's tokens. The kit's own ToolCall is a compiled runtime that needs `motion`, Radix and a Tailwind token bridge, so it was not copied in.

- **Tool calls**: the chat service streams `{type:'tool'}` events (`src/lib/domain/ai-chat-tools.ts`) with a plain-language title, kind, state and duration. `ChatToolCalls` shows them as a "Working · N steps" group that stays open while work runs, shimmers the active step and folds after completion. Titles never include raw arguments beyond a short search phrase. Tool rows are live only; a reloaded thread does not replay them.
- **Cards**: recipe, meal-plan, recipe-set, pantry/app-change and background-task cards share `chat-ui/card-parts.tsx` + `cards.module.css` (header, status badge, footer actions, callouts, disclosures). Card state (queued, partial, saved, errors) is an in-card callout, not a toast.
- **Meal-plan draft**: grouped by day and sorted by meal, with saved/new source pills, expandable recipe details and a per-meal "Not for me · swap" button that shows its own spinner. Occupied slots use a Keep / Use new meal control.
- **Loading states**: thinking row before the first token, tool-step spinners, a draft-card skeleton while a recipe or plan is generated, streaming caret, send/stop/attach spinners, per-button pending states on cards.
- **Empty state** offers starter prompts; the composer is one surface with a stop button in its action rail; "Jump to latest" floats over the conversation.

Verification used a mocked stream and mocked thread endpoints only; no provider call was made.

## Recipe and meal-plan cards, photos and batch notices

- **Recipe draft**: facts chips, a calories/macros bar, numbered method steps, an optional photo area and an "Ask for changes" action that puts the draft id in the composer.
- **Photos by default**: a recipe draft created during the current visit starts one photo request automatically (the existing explicit `/api/v1/ai/actions/:id/image` request with `confirm: true`, operation id and source digest). This is a per-browser preference (Assistant settings → "Create a photo for new recipe drafts", on by default). It never repeats a failed or interrupted request, never runs for drafts that were already in the thread when it opened, and does nothing unless the server reports image generation as available.
- **Meal plans and recipe sets**: a labelled "Create photos for N new recipes" switch (on when available). Confirming sends `generateImages: true` in the existing decision call; the server queues one `recipe_images` job for the newly saved recipes only after the plan is saved. A plain confirmation still never starts a paid image job.
- **Availability**: `ai-image-delivery.ts` reports `{available, reason, count, mode}` for each draft from the same gates the paid operations enforce (provider configured, image workload enabled, recipe sharing allowed). Unavailable reasons are shown instead of a switch.
- **Batch notices**: when the task execution mode makes the image job a provider batch (`auto` at or above the batch threshold, or `batch`), the plan card says it runs as a batch, may take a while, and to check back later; after saving, the card repeats this and the task card is labelled "Batch process" with the same message. A failed or unavailable image request never undoes the saved plan; the card says it saved without photos and why.
- **Plan layout**: summary stats, collapsible days (long plans open one day at a time, with expand/collapse all), per-meal time/kcal for new recipes.

Verification used mocked image endpoints and a deterministic test provider; no live image or text request was made.

## Reviewing a drafted meal plan (keep / change, swipe)

- Every meal in a pending draft has **✓ Keep** and **✗ Change** buttons; each day has **Keep day**. The same actions are available as swipes (`chat-ui/swipe-row.tsx`): a meal right = keep, left = change; a day header right = keep every meal that day (and fold it), left = clear that day's kept marks. The buttons are the accessible path; swiping never replaces them. Vertical scrolling is left to the browser and a drag only starts after a clear sideways move, so links, buttons and scrolling keep working.
- **Change** reuses the scoped replacement request (`revise_meal_plan_draft`), so only that meal is replaced. It is sent after a 3-second **Undo** window so a stray swipe never costs an AI request. Other change buttons are disabled while one is pending or running.
- Progress ("N of M kept", "Keep all" / "Clear all") is local review state, not a saved decision: **Confirm plan** still saves the whole draft whatever has been kept. Kept meals are remembered per thread by date, slot and title, so they stay kept when a swapped meal produces a new draft; the replaced meal returns unreviewed. Scheduled-task drafts (no change handler) get Keep only.
