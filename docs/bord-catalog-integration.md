# Native Bòrd Food API integration

This integration follows `bord-food-api/contracts/BORD-HANDOFF.md` and the native `1.0.0` envelope. It is separate from the existing [USDA mirror configuration](local-food-api.md). Installation and live source activation remain operator actions.

## Configuration

Configure the **Bòrd server**, then restart it:

```dotenv
BORD_FOOD_API_BASE_URL=http://bord-food-api:8080
BORD_FOOD_API_KEY=your-server-read-key
BORD_FOOD_API_TIMEOUT_MS=5000
BORD_FOOD_API_IMAGE_TIMEOUT_MS=20000
FOOD_DATA_MODE=catalog_only
FOOD_DATA_ALLOW_REMOTE_FALLBACK=false
STORE_DIRECTORY_ENABLED=true
```

The base URL is the service root, without `/fdc/v1`. HTTP(S) is required; embedded credentials, query strings and fragments are rejected. The read key is required by Bòrd and sent only in `X-Api-Key`. Nothing uses `NEXT_PUBLIC_*`. Requests refuse redirects, have a deadline and accept at most 4 MiB of response data.

For Tower's HTTPS endpoint, use `BORD_FOOD_API_BASE_URL=https://food-api.tower`. Its private certificate authority must be trusted by the Bòrd server. Set `NODE_EXTRA_CA_CERTS` to the mounted Tower root certificate **before starting Node**, for example `NODE_EXTRA_CA_CERTS=/path/to/Tower-Caddy-Root.crt pnpm dev`. Setting this variable only in Next's `.env.local` is too late for Node's TLS initialization. In a container, mount the certificate read-only and set the variable in the container environment. Keep certificate verification enabled. The API's server read key is separate from a public USDA API key.

Both Bòrd Compose templates pass these settings through. They do not install the API or connect separate Compose networks; configure a reachable address/network yourself. The queue Compose override inherits the base service environment.

| Mode                | Behavior                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `direct` (default)  | Existing USDA/OFF providers; existing `USDA_FDC_*` mirror settings still work.                                                                |
| `catalog_preferred` | Native catalog first. Direct source requests are allowed only when `FOOD_DATA_ALLOW_REMOTE_FALLBACK=true`.                                    |
| `catalog_only`      | Native food lookups only, even if fallback is set to true. Direct providers refuse requests and catalog records contain no source image URLs. |

Store-directory access is independently controlled by `STORE_DIRECTORY_ENABLED` (default false). Missing configuration, initializing packs, disabled sources, outages, partial availability, stale sources and rights restrictions remain explicit. **Settings → System** shows sanitized catalog/pack status. It never exposes endpoints, keys, worker jobs or administrative source controls.

## Food review and confirmation

The existing food picker and rapid barcode queue use the native transport in catalog modes. USDA name search uses the same local service’s `/fdc/v1/foods/search`; OFF product search and GTIN resolution use native routes. When the optional product pack is absent or has no match, barcode lookup can still match and pin a branded USDA record through the same local service. Generic/branded USDA filters are sent before pagination. Sources remain `usda_fdc` and `open_food_facts`. Separate alternatives retain their own nutrition and attribution.

Barcode lookup checks the optional product pack's capabilities before resolving it. Disabled or initializing packs retain their explicit status and do not delay the independent local USDA lookup.

Selections carry a `catalogRef` with transport, source record, exact content revision, catalog generation and optional canonical product ID. Confirmation re-reads the exact revision without stale-cache fallback. Changed or removed revisions return `409 REVISION_EXPIRED`, asking the user to review again. Successful operation IDs can replay during an outage without creating duplicate stock. Local product edits remain separate from imported provenance.

The catalog details pane can check public store evidence. Unknown availability is shown as unknown; empty offers/placements stay empty. Historical chain evidence is not presented as branch stock. These reads do not add cart items, pantry products, stock, consumption or purchases.

Native search cache keys include endpoint/key/config fingerprint, generation, normalizer version and locale. Capabilities/generation metadata are polled at most once every five minutes per configuration in each server process; source search results expire after one minute. Partial source statuses remain attached to cached results. Native reads do not consume direct USDA/OFF request budgets. Exact review confirmation is always fresh. Direct provider cache keys are also isolated by endpoint/configuration and mode.

## Application contracts and native review

The native scanner uses the same source review and confirmed imports as the web picker. A scan retains the full source reference and basis, offers distinct alternatives, and asks for quantity/unit and destination. Pantry confirmation creates the reviewed source product and stock batch together; shopping confirmation either explicitly replaces a reviewed existing row’s cart amount or creates a separate in-cart entry. It stores cart amount/unit independently from requested quantity/unit. A saved local barcode match reuses its product ID without a provider import. Neither route is a retailer purchase or Nutrition intake. Saved provider identity is structured data, not a note or display-name match.

Supported read contracts are:

| Endpoint (POST under `/api/v1`)       | Input and meaning                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/food-data/catalog/measures`         | `reference`, optional `form`/`basis`; exact-revision serving measures. A gram equivalent is usable only when supplied for that measure                      |
| `/food-data/catalog/storage-guidance` | `query`, optional `form`, `storageState`, `cursor`; attributed guidance, separate missing/error states                                                      |
| `/food-data/catalog/chains`           | Optional `country` (US) and `cursor`; human chain labels, bounded pagination                                                                                |
| `/food-data/catalog/stores`           | Name query, chain, two-letter state or explicit latitude/longitude; optional radius/cursor. Browser location is requested only through Use my location      |
| `/food-data/catalog/enrichment`       | Up to 100 uniquely identified lines `{lineId,productId,storeId?}`. The inspected provider does not implement free-text matching, so it is not accepted here |

These POST endpoints are reads. They require the relevant read capability, never import implicitly, and have bounded validated responses. Directory endpoints additionally respect the installation's directory gate. See [OpenAPI](openapi.yaml) for exact schemas and error envelopes.

`POST /shopping-lists/{listId}/catalog-items` accepts the reviewed food import contract plus `cartQuantity`/`cartUnit`; matching an existing item also requires its `itemId` and `expectedUpdatedAt`. Shared services validate the source revision and commit the product snapshot, item match/cart state and acknowledgement in one transaction. Existing recipe demand and item notes remain separate.

An uncertain web/native confirmation keeps its original operation ID and submitted values. Retry that command; do not create a fresh ID merely because the response was lost. A successful receipt is checked before contacting the provider, so an outage cannot prevent replay of an already committed confirmation. New receipts bind account identity, active profile and normalized intent. Compatibility replay of older receipts retains their existing profile/intent binding. A failed current-data refresh does not undo an acknowledged import.

## Saved stores and maps

In **Settings → Lists**, save a custom store, then use **Official branch** to search and link its directory record. Linking, unlinking and accepting official metadata keep the existing profile UUID, custom name/location/notes, section and aisle IDs, order, manual corrections and shopping-list relationships. Unsaved household edits in the form are retained too.

Search by branch name, city or ZIP in **Find a branch**, or expand filters for a US state, chain or explicit nearby-location search. Select **Link branch**, then choose that saved store under **Manage list → Shopping at** on a shopping list, including on phones. To reuse it for future lists, choose **Default for new lists** and save list preferences. Full-address-only source records remain readable as well as structured street/city/postal addresses. If the directory is disabled or its connection is missing, the page explains that state and keeps custom stores usable. Setting only `USDA_FDC_BASE_URL` does not enable the native store directory; it requires the `BORD_FOOD_API_*` settings and `STORE_DIRECTORY_ENABLED=true` above.

**Review official updates** compares fresh public metadata with the selected snapshot. It does not automatically apply it. Accept an update explicitly. Source-reported closure or relocation appears as a notice; an absent source record is an error, never a closure assertion. Hours may be stale.

Official map links remain usable while asset rights are pending. This implementation does not fetch or proxy map assets. Existing uploaded maps remain available. Manual route overrides retain priority; unavailable branch placements do not invent aisle numbers or replace the deterministic category route. The current native API’s unknown placements/offers stay unknown. Applying future verified placement packs or coordinate anchors requires a separate reviewed routing flow.

## Migration and storage

`0067_bord_catalog_links.sql` adds nullable store-association metadata and explicit catalog provenance columns on reviewed food snapshots. No applied migration is edited and no household records are re-created. Standard application startup applies it; for an explicit migration, run `pnpm db:migrate` with the intended database configured and the usual backup procedure.

Reviewed food snapshots remain in the household database and its recovery bundles. The separate national catalog is never imported into Bòrd’s database. Native caches are process-local; existing backup logic excludes direct provider caches and rate-limit rows. Provider keys stay in environment configuration. No receipt, household notes or watchlist upload is implemented.

## Validation and activation boundary

Synthetic fixtures in `tests/fixtures/bord-catalog-server.ts` serve bounded loopback responses without downloading datasets or contacting external providers. Coverage includes profile migration/link/rename/refresh/unlink and override retention; revision conflicts and durable nutrition; configuration/generation cache isolation; catalog-only egress and image denial; unknown retail evidence; outage/partial/stale/disabled/rights states; real session/origin/API-key guards; and existing purchase idempotency.

The browser test `tests/e2e/bord-catalog.spec.ts` uses synthetic directory responses to check linking/unlinking, unsaved edits, pending map rights, accessibility and viewport widths 320/390/768/1440. It does not prove a live API deployment.

The historical companion validation below did not perform live source verification, crawler/download, paid connector calls or Docker/Unraid deployment. Current refinement evidence and publication status are recorded separately in the refinement handoff. Before activation, verify the actual API/network/read-key configuration, source-pack readiness and source/map permissions. Existing local stores/products remain usable without the catalog.

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

## Current refinement evidence

See [catalog and native register](refinement/catalog-native.md) for current behavioral checks, capability/ownership matrices, synthetic screenshots, native build evidence and remaining device/dependency limits. The historical results above are retained as historical evidence, not reused as current acceptance.

### Local Tower connection verified — 2026-10-23

The owner-authorized local checkout uses `https://food-api.tower`, the existing server read key in ignored `.env.local`, `catalog_only`, no remote fallback, and the enabled store directory. HTTPS was validated against Tower's private CA. No Tower deployment or service configuration was changed.

A production-browser check against a temporary household database exercised the real API through Bòrd's authenticated routes. UPC `041498926526` resolved to ALDI cooking sprays and `078742378213` to Great Value lemonade, with canonical GTINs and pinned USDA source revisions. The same journey searched Iowa Aldi branches, linked the Mason City branch at 520 Village Green Drive SW, renamed the household store, saved its default preference, and selected it on a phone-sized shopping list. The link, default and list selection survived reloads; no uncaught browser errors occurred.

The API reported usable USDA and store packs, with some store sources stale. Open Food Facts and live pricing were disabled. These observations establish working integration for the sampled records, not complete UPC/retailer coverage or current branch stock. Manual food/store entries remain available for missing records.

## Reviewed cart amounts and restart recovery

`POST /api/v1/shopping-lists/{listId}/catalog-items` accepts an exact reviewed remote selection or a saved `localProductId`. Lookup never imports or changes stock. Confirmation requires its original operation UUID and explicit `cartQuantity`/`cartUnit`, independent of recipe demand. With no item ID it creates a separate cart row; with `itemId` and `expectedUpdatedAt` it replaces that reviewed row's cart amount. `cartIntent` can name `separate_entry` or `replace_existing`; incompatible combinations fail validation. It never implicitly adds to a prior cart amount.

The result and local mutation commit together. Keep the same operation and original account/profile context after an uncertain response. Completed replay works during catalog outages. A changed intent uses a new operation only after the old outcome is resolved. New remote writes re-fetch the reviewed revision; expired revisions require renewed review. Existing local products need no provider request.

Migration0073 preserves legacy cart numbers but leaves their purchase unit unreviewed (`cartUnit:null`). Review it before unpacking; demand units or free-text labels are not authoritative evidence.500g purchased against2each demand stays500g and does not claim demand coverage. Compatible g/kg coverage uses existing inventory conversion; mass/volume/count are never converted without evidence.

System → Food providers → Effective food-data configuration shows current mode, effective remote fallback, provider/catalog deadlines, quotas and freshness/stale/cache limits without credentials. These installation settings come from named environment variables or defaults and require restart/recreation. Configured quotas are not live remaining allowance, and pack readiness is separate from code capability.

## Reviewed source portions and restart recovery

Measures retain `amount`, `unit`, `modifier`, `description`, `gramWeight`, `form` and `basis`. For example, `2 cup · chopped` with `gramWeight: 240` means the entire two-cup source portion weighs 240 g; it is not one cup at 240 g. Missing quantities remain null. Web Pantry, recipe/import editors and supported saved-food intake forms can copy the full supplied gram weight into an editable amount; only their explicit Save/Log action writes. Saved-food measures use the exact snapshot belonging to the selected nutrition record, not a newer linked revision.

The source-review enrichment action accepts identified canonical product IDs. Free-text enrichment is not advertised. Missing source evidence, unavailable packs and failed requests remain distinct. Native store discovery uses a deliberate handoff to the same kitchen’s existing settings editor and its chain/area/proximity/pagination controls.

Native scanner confirmations use an encrypted write-ahead journal bound to instance/account/original profile. Assistant recovery stores only owned server operation references. Neither reconnect nor restart resubmits work automatically. `/auth/context` provides minimal session actor binding and reviewed scanner write routes enforce the optional `X-Bord-Expected-Profile-Id` header. Exact receipts remain usable during provider outage after current authorization. See [post-review evidence](refinement/post-review-catalog.md).

## Product photos

When `BORD_FOOD_API_BASE_URL` and `BORD_FOOD_API_KEY` are set, Bòrd shows a product photo beside Pantry products and batches, the physical count page and the scan list. Without them nothing is requested and every product keeps its category icon.

Photos come from the API's barcode-matched image cache (`GET /v1/product-images/{gtin}`; see `bord-food-api/docs/PRODUCT-IMAGES.md`). The browser never calls the API. It requests `/api/v1/food-data/images/{gtin}` on Bòrd, which needs a signed-in session or a Pantry-read key and forwards the request with the server-held `X-Api-Key`:

- Matching uses only a checksum-valid retail barcode (UPC-A, EAN-13 or GTIN) saved on the product, preferring a verified one. Names are never used to guess a photo, and a USDA product does not imply a photo exists.
- A cold lookup can take several seconds (6.55 s live), so photos use `BORD_FOOD_API_IMAGE_TIMEOUT_MS` (default 20 000), not the five-second catalog timeout. Bòrd runs at most three upstream photo requests at once, shares one request between callers for the same barcode, waits once for a short `Retry-After`, keeps recent results in memory and honors `ETag`/`If-None-Match`.
- Only a JPEG of at most 2 MiB is relayed. A missing photo (404) is remembered for an hour; temporary failures (503), a rejected key (401) and rights blocks (403) are never remembered as "no photo". The page shows the placeholder meanwhile.
- The photos are Open Food Facts images under CC BY-SA 3.0. Pages that show them display the attribution, the licence link and the note that they were resized and converted to JPEG.
