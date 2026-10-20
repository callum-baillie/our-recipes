# Recipe image refinement

## Delivered behavior

Manual recipe photo generation now prepares a private candidate for the signed-in account and linked profile. It does not add a photo until **Add reviewed photo** succeeds. Existing uploaded, imported and generated photos remain saved. The gallery identifies generated previews and saved AI photos.

Each candidate records the recipe revision, a normalized intent digest, effective model, quality, size, prompt version and audit ID. `operationId` is a UUID generated once per deliberate paid preview. An exact replay returns the durable request state before contacting the provider; changed intent with the same ID is rejected. Acceptance rechecks the recipe revision in a transaction and replays an already accepted image ID. Other accounts and switched profiles cannot inspect or accept the candidate.

The browser retains only the operation ID and submitted revision/quality/framing in session storage, scoped to account, profile and recipe. After interruption, **Check this request** is a read. **Stop waiting** aborts the client/provider request where supported; it does not claim that provider execution or billing stopped. Requested/failed operations never automatically regenerate. **Discard this preview** prevents late results from being attached and removes available preview media. Starting another preview is a separate explicit paid action. Candidate tombstones remain for replay; there is no automatic retry or background image request.

The previous `{ "confirm": true }` direct-save API remains compatible for existing integrations. New web and native review use `{ "confirm": true, "preview": true, "operationId": "…", "expectedRevision": 3 }`. This compatibility path does not inherit candidate replay protection. New integrations should use the reviewed path. Candidate routes, ownership, errors and permissions are documented in OpenAPI.

Administrator image defaults are low quality and 1024 × 1024 unless explicitly changed. Medium/high and 1536 × 1024 / 1024 × 1536 choices require the administrator's image-override policy. Neither preview nor retry changes the configured model. OpenAI requests have bounded timeouts and SDK retries disabled. Queued image jobs snapshot their approved settings; policy revocation is still checked at execution.

## Prompt and evaluation

`finished-dish-v2` includes recipe yield, bounded ingredient quantities/units and preparation, and the actual cooking method. Immutable instructions treat recipe text as untrusted data, preserve the finished dish identity, avoid invented garnish and raw-ingredient displays, and aim for realistic texture, portion, ordinary tableware and crop-safe framing. Administrator presentation guidance remains subordinate to these rules. The audit records the image and administrator prompt versions.

The deterministic set covers soup, stew, casserole, bread, salad and dessert. It verifies exact input grounding, bounded source text, instruction separation and provider request controls. Synthetic WebP fixtures verify storage/review, permission, stale-recipe, replay, cancellation/discard and late-result behavior. These checks do not establish photographic quality.

For an explicitly authorized live evaluation, generate one preview for each fixture using its recorded recipe revision, model, prompt version, quality and size. Score 0–2 for each item:

- **Recipe identity:** visible components and dish type match the method and ingredients.
- **Physical realism:** plausible moisture, crumb/sauce, cut size, cooked state and portion.
- **Presentation:** ordinary tableware, coherent lighting/shadows and useful card crop.
- **Artifacts:** no text/logos, invented garnishes, floating food or duplicate/impossible objects.

Record individual scores and image paths; reject a candidate with any zero. Compare the same fixtures/settings across prompt changes. A mock, prompt inspection or successful provider request is not a visual-quality pass. Live evaluation remains blocked by the absence of explicit paid-call permission; no live image call was made.

Parameter reference checked against [OpenAI image generation documentation](https://developers.openai.com/api/docs/guides/image-generation) on 2026-10-19. No price is displayed for an unverified/custom configured model, and no total cost guarantee is inferred from output-only image pricing.

## Executed evidence

- `tests/unit/recipe-image-prompt.test.ts`: 8 deterministic cases, including six dish types, untrusted recipe text and bounded provider parameters.
- `tests/unit/recipe-image-generator.test.ts`: 3 mounted cases for pending freeze, explicit acceptance, exact retry after interruption/remount, and recoverable validation rejection.
- `tests/integration/recipe-image-candidates.test.ts`: 5 cases covering actual synthetic storage, exact replay, recipe/detail grounding, ownership, stale revision, late discard, privacy and administrator override policy.
- `pnpm exec playwright test tests/e2e/recipe-image-review.spec.ts --workers=1 --output=/tmp/bord-full-refinement/image-browser-results`: **1 passed (17.8s)**. Pending, ready and stale acceptance states use a synthetic WebP and intercepted generation; the old uploaded photo remains visible. Final actions are in view at 1440×1000, 390×844 and 320×568, no horizontal page overflow, and the image review's axe scan has zero violations.
- Captures are in `screenshots/full-refinement/images/` and indexed in `screenshots/full-refinement/workflow-images.json`. They prove the review interface, not live image quality.

Migration `0070_recipe_image_candidates.sql` adds the candidate ledger without rewriting applied migrations. Root release verification owns clean-install/upgrade checks and final publication status.

Native recipe metadata now uses the same private candidate/check/accept/discard contracts. The account/instance/recipe-scoped SecureStore entry holds only the request UUID, not a credential or image; initial storage read must succeed before a new paid request. A transport/5xx outcome retains its identity; explicit preflight rejection releases it. Native clean type/lint/test and iOS/Android bundle evidence do not establish device rendering.
