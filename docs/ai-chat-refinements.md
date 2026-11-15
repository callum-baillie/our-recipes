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
