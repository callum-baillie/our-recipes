# Recipe workflow UI contracts

Use the warm paper, green ink and terracotta action tokens described in the visual specification. Recipe reading, editing and intake share `PageHeader`; cooking is an immersive exception with dark green surroundings and cream instructions.

## Reading

- Keep the jump link in document flow. `#recipe` retains the shared header offset.
- Preparation information belongs before ingredients and method. Classification and source nutrition form a compact supporting rail on desktop; long shared/private notes, maintenance and history follow the reading content.
- A single-photo gallery is bounded on desktop. Reading mode has one **Manage photos** entry; removal belongs to management mode. Generated serving images retain their explicit label. Multiple images keep their responsive gallery/scrolling behavior.
- Native nutrition disclosures use `recipe-disclosure-summary`: heading/status at the left, one chevron at the right. Ingredient-based calculations feed meal tracking; recipe-source nutrition remains per serving when ingredient quantities change. Empty source nutrition has an empty state, rather than a grid of unknown cells. Estimation copy identifies its paid request and saved revision before activation.
- A rating and Like/Staple are linked preferences. The note/rating form saves both deliberately; clicking a star only changes that draft. Keep intermediate ratings intact.

## Editing

- One submission handler serves the top and bottom save buttons. Empty optional groups collapse; their summaries expose populated fields. Validation opens and focuses the relevant group. Single-line fields stay top aligned; method/equipment textareas grow to a bounded maximum.
- Preserve shopping categories, custom difficulty, free-text yield, ingredient notes and food links. New recipe prep/cook times begin blank; explicit saved zero values remain zero. The existing stored timing model uses zero for unprovided values and has no separate explicit-zero marker; this UI does not migrate that data.
- Ingredient rows own their stable field-array identity. Optional notes and shopping categories live in a Details disclosure whose summary names the saved category and indicates a note. Method steps keep stable local keys through movement; numbering restarts per section. Keep keyboard movement alternatives and confirm populated removals.
- `recipe-draft.ts` validates a bounded, incomplete recovery shape. Actual saving still uses the strict recipe schema. Do not overwrite a recoverable draft while its prompt is pending. Storage failure must leave editing usable and show recovery feedback.
- AI Improve retains the current editor while requesting a candidate. Review/apply is explicit, and undo restores the editor from before application, including changes made while waiting. Applying never saves the recipe.
- Catalog forms render in a body portal and contain submit propagation. Neither DOM nesting nor React propagation may submit the recipe form. Lookup links food identity and retains recipe amounts/notes; it creates no pantry stock or diary intake. Substantial identity changes require Keep/Clear decisions before saving. New lookups read the current ingredient; Search/Scan share that lookup's query. Cancel read-only requests and ignore stale responses.
- Taxonomy choices remain distinct from stored tags. Comboboxes retain custom/multiple values, announce the active option, and clamp/flip within the viewport. Saved tag colours are used as swatches so arbitrary colours cannot reduce name contrast.

## Intake and cooking

- Text/idea and URL intake own separate drafts and errors. Switching never starts a request. URL Enter uses the button's guarded submission; textarea Enter remains a newline.
- Choosing files prepares previews on the device. Creating a review draft uploads source files to Bòrd and sends them to AI when selected; confirming adds the recipe. Manual transcription accompanies files and takes precedence over automatic reading. Its native disclosure state is independent of text content. Structured JSON-LD is parsed by Bòrd's server.
- Cooking navigation changes position; completing a step is a separate action. Neither starts a session or deducts stock. Start records a whole-number batch of 1–100 servings and locks that quantity for the session. Finish opens the shared native `AppDialog` for pantry review.
- Pantry checks expose their checked serving count. A changed intended batch is stale until a successful recheck; failures retain the last-known result. Cooking never edits shared ingredient mappings.
- Timers are local and timestamp based. A new timer needs 1–1,440 finite minutes. Keep pause/resume/remove and completion announcements; do not imply background notification or persistence support.
