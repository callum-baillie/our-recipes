# Native Bòrd Food API integration

This integration follows `bord-food-api/contracts/BORD-HANDOFF.md` and the native `1.0.0` envelope. It is separate from the existing [USDA mirror configuration](local-food-api.md). Installation and live source activation remain operator actions.

## Configuration

Configure the **Bòrd server**, then restart it:

```dotenv
BORD_FOOD_API_BASE_URL=http://bord-food-api:8080
BORD_FOOD_API_KEY=your-server-read-key
BORD_FOOD_API_TIMEOUT_MS=5000
FOOD_DATA_MODE=catalog_only
FOOD_DATA_ALLOW_REMOTE_FALLBACK=false
STORE_DIRECTORY_ENABLED=true
```

The base URL is the service root, without `/fdc/v1`. HTTP(S) is required; embedded credentials, query strings and fragments are rejected. The read key is required by Bòrd and sent only in `X-Api-Key`. Nothing uses `NEXT_PUBLIC_*`. Requests refuse redirects, have a deadline and accept at most 4 MiB of response data.

Both Bòrd Compose templates pass these settings through. They do not install the API or connect separate Compose networks; configure a reachable address/network yourself. The queue Compose override inherits the base service environment.

| Mode                | Behavior                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `direct` (default)  | Existing USDA/OFF providers; existing `USDA_FDC_*` mirror settings still work.                                                                |
| `catalog_preferred` | Native catalog first. Direct source requests are allowed only when `FOOD_DATA_ALLOW_REMOTE_FALLBACK=true`.                                    |
| `catalog_only`      | Native food lookups only, even if fallback is set to true. Direct providers refuse requests and catalog records contain no source image URLs. |

Store-directory access is independently controlled by `STORE_DIRECTORY_ENABLED` (default false). Missing configuration, initializing packs, disabled sources, outages, partial availability, stale sources and rights restrictions remain explicit. **Settings → System** shows sanitized catalog/pack status. It never exposes endpoints, keys, worker jobs or administrative source controls.

## Food review and confirmation

The existing food picker and rapid barcode queue use the native transport in catalog modes. USDA name search uses the same local service’s `/fdc/v1/foods/search`; OFF product search and GTIN resolution use native routes. Sources remain `usda_fdc` and `open_food_facts`. Separate alternatives retain their own nutrition and attribution.

Selections carry a `catalogRef` with transport, source record, exact content revision, catalog generation and optional canonical product ID. Confirmation re-reads the exact revision without stale-cache fallback. Changed or removed revisions return `409 REVISION_EXPIRED`, asking the user to review again. Successful operation IDs can replay during an outage without creating duplicate stock. Local product edits remain separate from imported provenance.

The catalog details pane can check public store evidence. Unknown availability is shown as unknown; empty offers/placements stay empty. Historical chain evidence is not presented as branch stock. These reads do not add cart items, pantry products, stock, consumption or purchases.

Native search cache keys include endpoint/key/config fingerprint, generation, normalizer version and locale. Capabilities/generation metadata are polled at most once every five minutes per configuration in each server process; source search results expire after one minute. Partial source statuses remain attached to cached results. Native reads do not consume direct USDA/OFF request budgets. Exact review confirmation is always fresh. Direct provider cache keys are also isolated by endpoint/configuration and mode.

## Saved stores and maps

In **Settings → Lists**, save a custom store, then use **Official branch** to search and link its directory record. Linking, unlinking and accepting official metadata keep the existing profile UUID, custom name/location/notes, section and aisle IDs, order, manual corrections and shopping-list relationships. Unsaved household edits in the form are retained too.

**Review official updates** compares fresh public metadata with the selected snapshot. It does not automatically apply it. Accept an update explicitly. Source-reported closure or relocation appears as a notice; an absent source record is an error, never a closure assertion. Hours may be stale.

Official map links remain usable while asset rights are pending. This implementation does not fetch or proxy map assets. Existing uploaded maps remain available. Manual route overrides retain priority; unavailable branch placements do not invent aisle numbers or replace the deterministic category route. The current native API’s unknown placements/offers stay unknown. Applying future verified placement packs or coordinate anchors requires a separate reviewed routing flow.

## Migration and storage

`0067_bord_catalog_links.sql` adds nullable store-association metadata and explicit catalog provenance columns on reviewed food snapshots. No applied migration is edited and no household records are re-created. Standard application startup applies it; for an explicit migration, run `pnpm db:migrate` with the intended database configured and the usual backup procedure.

Reviewed food snapshots remain in the household database and its recovery bundles. The separate national catalog is never imported into Bòrd’s database. Native caches are process-local; existing backup logic excludes direct provider caches and rate-limit rows. Provider keys stay in environment configuration. No receipt, household notes or watchlist upload is implemented.

## Validation and activation boundary

Synthetic fixtures in `tests/fixtures/bord-catalog-server.ts` serve bounded loopback responses without downloading datasets or contacting external providers. Coverage includes profile migration/link/rename/refresh/unlink and override retention; revision conflicts and durable nutrition; configuration/generation cache isolation; catalog-only egress and image denial; unknown retail evidence; outage/partial/stale/disabled/rights states; real session/origin/API-key guards; and existing purchase idempotency.

The browser test `tests/e2e/bord-catalog.spec.ts` uses synthetic directory responses to check linking/unlinking, unsaved edits, pending map rights, accessibility and viewport widths 320/390/768/1440. It does not prove a live API deployment.

No live source verification, crawler/download, paid connector, Docker/Unraid deployment, Git push or release is part of this implementation run. Before activation, verify the actual API/network/read-key configuration, source-pack readiness and source/map permissions. Existing local stores/products remain usable without the catalog.

### Recorded companion validation — 2026-10-18

| Gate                                             | Result                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm format:check`                              | Passed across the repository.                                                          |
| `pnpm lint`                                      | Passed.                                                                                |
| `pnpm typecheck`                                 | Passed.                                                                                |
| `pnpm test`                                      | 395 unit tests and 258 integration tests passed; 9 existing integration tests skipped. |
| Focused final catalog/client/auth regression run | 28 tests passed, including removed-revision handling.                                  |
| `pnpm openapi:validate`                          | Passed validation, coverage and generated-client smoke for 155 documented operations.  |
| Development browser fixture                      | Passed at 320/390/768/1440 widths; light/dark accessibility checks passed.             |
| `RAYON_NUM_THREADS=2 pnpm build:release`         | Passed; clean standalone artifact verified (3,503 files).                              |
| Standalone production browser fixture            | Passed the same directory flow and accessibility checks against the built server.      |
| `pnpm diff:check`                                | Passed.                                                                                |

The migration test upgrades a synthetic database from the prior schema, retains the original profile/route identities and passes SQLite foreign-key checks. Tests use temporary databases and synthetic source responses. This evidence does not establish a live food API connection, retailer/map rights approval, deployment or source ingestion. The full release-wide browser oracle, Docker/Unraid execution and live source verification were not run for this change.
