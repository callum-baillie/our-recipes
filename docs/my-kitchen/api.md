# My Kitchen API

See `docs/openapi.yaml` for request bounds. Browser/native sessions use the existing authentication. Session mutations retain exact trusted-origin checks. Kitchen integrations have a separate `kitchen` scope; the current POST command envelope requires `update`, plus `create` for add or `delete` for archival, and reads require `read`. Compatibility checks additionally require `recipes:read`, and planned-meal sources require `mealPlans:read`. Private session snapshots and accepted episode plans are session-only, including nested compatibility paths. Personal cooking preferences are session-only.

- `GET /api/v1/kitchen`: stable primary kitchen, coverage, revision, individually addressable equipment, reviewed viewer profile and management capability.
- `GET /api/v1/kitchen/catalog`: versioned local templates/aliases/defaults.
- `POST /api/v1/kitchen`: reviewed add/update/coverage command.
- `POST /api/v1/kitchen/check`: bounded multi-recipe feasibility preview. Does not reserve equipment.
- `GET /api/v1/kitchen/claims`: physical-use claims, including abandoned phases.
- `POST /api/v1/kitchen/claims`: atomic start or explicitly acknowledged release.
- `GET/PATCH /api/v1/account/cooking-preferences`: account-personal values with their own SHA-256 revision, preserving unrelated profile/interview fields.

Read the actual kitchen revision first. Use an independently generated UUID `operationId` for each deliberate new intent. Retrying the identical normalized command recovers its original receipt even if the inventory has since changed. Reusing an ID with another body, actor or kitchen returns 409. Permission revocation is checked before replay. A new deliberate addition uses a new operation ID. Operation receipts survive application restart in SQLite.

```json
{
  "kind": "add",
  "operationId": "4d8887bb-03b8-4cc1-8f8e-c46eae993bd7",
  "expectedRevision": 0,
  "count": 2,
  "item": {
    "typeKey": "electric-pressure-cooker",
    "name": "Countertop cooker",
    "measurements": []
  }
}
```

This creates two bases with different IDs and unknown sizes. `count` is bounded 1–20, active inventory 500. An update targets `itemId` and `expectedItemRevision`, with the current kitchen `expectedRevision`. The item is a full reviewed replacement: omitted optional fields receive conservative defaults. Browser/native forms carry the existing full item. Use `[]` to explicitly clear measurements/capabilities, `null` to clear a parent/oven limit, and `archived` to remove one item while retaining history. A lost-response retry must preserve the exact original command, not attach a current revision to an old unreviewed body.

```json
{
  "kind": "update",
  "operationId": "a77c04b6-6588-412b-81fd-002d22f3650c",
  "expectedRevision": 1,
  "itemId": "ca0addd2-0744-42e0-8d3d-b13a815e66c0",
  "expectedItemRevision": 1,
  "item": {
    "typeKey": "saucepan",
    "name": "Large saucepan",
    "induction": "yes",
    "measurements": [{ "value": 3, "unit": "l", "basis": "nominal-volume" }]
  }
}
```

Measurement values must be positive. Entered units/basis/provenance round-trip. Comparable normalization converts litres/ml, US liquid quarts (946.352946 ml), imperial quarts (1136.5225 ml), mm/cm/in and g/kg. Basis and applicable mode must also match. Nominal volume is not a working-liquid limit. Dimensions cannot compare to volume. Slices per cycle are not servings. Device cups require an explicit device measuring-cup volume and dry-input basis. Unknown measurements are an empty array, not zero/unlimited. Compatibility is `yes`, `no` or `unknown`.

A plan supplies actual recipe IDs/revisions and actual step IDs, phase capabilities, quantity, optional same-basis amounts, duration/release occupancy, dependencies, accessories and hands-on status. Planned-recipe phases additionally pin meal ID and expected updated timestamp. The response is `compatible`, `conflict` or `needs-information`, assignments, issues and assumptions. `sequence` and `parallel` are bounded strategies, not an optimizing solver. Known insufficiency and unknown fit differ. Without explicit footprints a cavity remains exclusive. Compatible co-use requires known usable width/depth/height, matching confirmed mode and temperature, and combined same-level strip fit. Whole-quantity batch arithmetic is not implemented.

```json
{
  "operation": "start",
  "episodeId": "b99fbc05-583e-4659-9f38-cf432c602840",
  "phaseId": "stock",
  "plan": {
    "expectedRevision": 3,
    "phases": [
      {
        "id": "stock",
        "recipeId": "5336d248-004a-4a57-8ab3-576ae560d823",
        "recipeRevision": 1,
        "stepRefs": ["ef42c95e-5d10-4d20-afce-fda6ae68bd84"],
        "capability": "pressure-cook",
        "durationMinutes": 20,
        "releaseMinutes": 10
      }
    ],
    "strategy": "sequence"
  }
}
```

Replace the illustrative recipe and step IDs with actual IDs from the exact reviewed revision. Plans have 1–40 reviewed phases. Only the selected phase bundle is claimed. Repeated start for the same actor/episode/phase is idempotent; another active use is rejected atomically. Release sends `operation: release`, the same episode/phase and `acknowledged: true`. A timer/client/chat cancellation never releases claims. Other accounts cannot acknowledge someone else’s phase.

Recipe `equipmentRequirements` contain generic requirements only. Omission on an unrelated edit preserves them; changed instructions invalidate carried-forward references. Planned `recipeOverride` accepts optional `cookingMethod`, `equipment`, `equipmentRequirements`, `prepMinutes`, `cookMinutes` and `restMinutes` together with existing title/summary/yield/ingredients/instructions. Older clients can omit metadata without erasing it in normal metadata-preserving updates. Public recipe payloads contain no owned resource IDs.

## Owned cooking snapshots and episode context

New sessions started by `POST /api/v1/cook-sessions` capture the effective recipe and authenticated account owner. `GET /api/v1/cook-sessions/{sessionId}/recipe` returns the saved `effectiveRecipe`, `effectiveRevision`, `latestChangeId` and `ingredientReviewRequired`. These personal snapshot/context endpoints require a signed-in session and the original account and active profile; API keys cannot borrow another profile's snapshot. History list responses do not expose snapshots.

Apply a reviewed method change with `PATCH /api/v1/cook-sessions/{sessionId}/recipe`:

```json
{
  "kind": "adapt",
  "operationId": "eb681653-a876-4de3-a6d5-4adfa37af5c3",
  "expectedRevision": 1,
  "expectedKitchenRevision": 4,
  "change": {
    "cookingMethod": "Stovetop",
    "equipment": ["Saucepan", "Hob"],
    "equipmentRequirements": [],
    "instructionSections": [
      { "title": "", "steps": ["Simmer the potatoes in water until tender, then drain."] }
    ],
    "prepMinutes": 5,
    "cookMinutes": 25,
    "restMinutes": 0
  }
}
```

Empty requirements explicitly mean unverified structured fit; equipment text alone does not prove feasibility. All method fields must be present together. Omit `ingredientGroups` and `servings` to preserve them; explicit replacements follow recipe schema validation and invalidate nutritional evidence when the ingredient/yield facts change. Undo supplies `kind: "undo"`, a fresh operation ID, expected session/kitchen revisions and the latest `undoOperationId`. Replay the exact operation after a lost response; a new intent uses a new UUID. Replay returns the current snapshot and the originally applied revision, even after a later compensating revision. Completed sessions reject new changes; in-use equipment must be physically acknowledged as released before adaptation. JSON bodies are bounded to 128 KiB.

`GET/PATCH /api/v1/cook-sessions/{sessionId}/context` shares the same ownership seam. A restriction command is:

```json
{
  "kind": "restrictions",
  "operationId": "427ba419-d781-4895-a53e-fdfdb8298890",
  "expectedContextRevision": 0,
  "restrictions": {
    "timezone": "America/Chicago",
    "validOn": "2026-10-21",
    "excludedEquipmentIds": [],
    "excludedCapabilities": ["bake", "roast"]
  }
}
```

This capability example excludes baking/roasting for that episode on that date, including any device offering those modes. To exclude only the oven, identify its physical item(s) in `excludedEquipmentIds` instead. `restrictions: null` explicitly clears the episode restriction. Omission is invalid. Local-date comparison uses the supplied timezone and handles daylight-saving transitions without fixed-hour arithmetic.

Accept a plan with `kind: "accept-plan"`, operation ID, `expectedContextRevision`, and `plan` containing the bounded kitchen plan request. The plan must carry `episodeId`, `episodeContextRevision`, expected kitchen revision and each snapshot phase's `cookSessionId`/`cookSessionRevision`. A request may coordinate additional library/planned recipes in the same episode. Each phase still binds its exact source revision and step references. The response includes `acceptedPlan` and `acceptedPlanState` (`none`, `compatible`, `needs-review`). Preview/acceptance create no actual-use claim. Start one phase through `/kitchen/claims` with `acceptedPlanId`, `episodeId` and `phaseId`; atomically revalidation precedes claiming. Restrictions/context bodies are bounded to 64 KiB.

Assistant operations `readCookingSessionRecipe`, `changeCookingSessionRecipe`, `readCookingEpisode` and `changeCookingEpisode` use these same services and existing action cards. They require the account's own profile and current equipment, shared-recipe and Pantry sharing policies. Manual use requires no AI credentials or consent. No provider is called by these services.

## Measured cavity and compound-vessel checks

A phase may supply `cavityLoad: { widthMm: 200, depthMm: 300, heightMm: 100 }`, `mode: "roast"` and `temperatureC: 200`. Footprints include user-confirmed clearance. Owned cavity dimensions use the ordinary measurement array with width/depth/height bases and, for independently recorded cavities, the matching one-based `resourceIndex`. Unknown dimensions are needs-information; known insufficient space is a conflict. Two racks do not create two ovens. The allocator does not infer safety clearance, rotation, shelves, manufacturer timing or ingredient density.

For a stovetop pressure task, use a recorded heat capability, `needsVessel: true` and `vesselCapability: "pressure-vessel"`. The allocator requires both resources and checks induction where relevant. Passive cookware/attachments cannot become active heating bases by adding a pressure/air-fry capability string.

## Exact physical-use recovery

A successful phase start returns current `claims`, each with `useId`, and `phaseState: "active"`. Save this use token with the displayed review. Release the reviewed bundle with:

```json
{
  "operation": "release",
  "episodeId": "c7940f24-001e-4fe2-8cfe-1f02db853f83",
  "phaseId": "potatoes",
  "expectedUseId": "44111449-bc28-4da0-afb1-9ee7a082087d",
  "acknowledged": true
}
```

A missing or stale token cannot release active equipment. Exact start replay returns the original active/released outcome without taking new claims; a released start returns `phaseState: "released"`. An explicit repeat needs a newly reviewed plan/intent. A different allocation cannot adopt an already active bundle silently. Physical-use history retains original owner, allocation and acknowledged release actor/time. Existing clients must refresh use reviews to obtain tokens before releasing new or migrated claims.

To recover another owner’s abandoned phase, a current administrator must explicitly send `recoverAbandoned: true` with the reviewed token and physical acknowledgement. Both current account and effective active-profile roles must permit administration; a cached principal or switched profile cannot supply that authority. Child/read-only roles cannot claim, release or edit inventory. A timer, chat cancellation, proposal dismissal or disconnect is never release acknowledgement.

## Effective exports

Recipe JSON-LD, Markdown and PDF export routes accept either `sessionId` or `mealEntryId`. A session export requires the original signed-in account and active profile, matches the requested recipe and rejects API keys. A planned-meal export projects that meal’s effective recipe; API keys additionally need `mealPlans:read`. Neither query changes the library. Exporters receive portable recipe content, never household resource assignments. JSON-LD’s bounded “Bòrd recipe method metadata” property round-trips rest time and generic requirements; malformed/private assignment metadata is omitted with a review warning.

## Source-requirement coverage

For each exact library/planned/session source revision represented in a request, the service checks every recorded requirement against distinct proposed phases and bound step references. A phase must preserve the capability or a recorded alternative, at least the required resource quantity, the whole comparable measured amount, mode/temperature, pressure-vessel constraint and dish footprint. Dropping an operation or clearing an unresolved capacity flag does not make a source-compatible allocation. A coherent method change must first update the intended effective recipe through its reviewed scope.

Heat-source capabilities always require a suitable separate vessel; a false `needsVessel` flag cannot bypass that bundle. Old recipes without structured requirements remain manually usable: checks explicitly cover only the declared phases and do not claim that the recipe’s equipment list or fit is complete.
