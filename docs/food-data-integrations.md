# Food data providers and barcode scanning

Bòrd has a provider-neutral, read-only food-data layer for reviewed Pantry, recipe, and Nutrition workflows. Provider lookups never create stock, recipe mappings, or Food Diary intake by themselves.

## Providers

- Open Food Facts uses the v3.6 exact-product endpoint with a bounded field allowlist and identifying user agent. It is enabled by default. Deprecated Open Food Facts full-text search is deliberately unsupported.
- USDA FoodData Central supplies explicit name search, detail records, generic Foundation/FNDDS foods, and exact branded-GTIN fallback. It is disabled cleanly until `USDA_FDC_API_KEY` is set on the server.
- Existing Pantry products are searched first and do not consume provider quota. The same contract can later host a non-HTTP local catalog without changing browser code.

Provider responses are validated and normalized before caching or presentation. Missing nutrients stay missing, zero stays zero, original nutrient identifiers and units are retained, and records are grouped only by a checksum-valid canonical GTIN. Provider records are not averaged or merged by name.

## Review and persistence

The shared picker offers camera scan, manual GTIN entry, and explicit USDA search. A selection opens an editable local-product review; the server reloads the selected validated record rather than accepting provider nutrition echoed by the browser.

- Pantry confirmation creates or reuses a product by verified GTIN and adds physical batches in one idempotent transaction.
- Recipe confirmation creates or reuses the product and stores ingredient mapping intent, without adding stock.
- Nutrition confirmation creates or reuses the product and an append-only attributed nutrition revision. The user must separately confirm a portion before Food Diary intake exists.

Selected normalized snapshots and provenance links are durable household data. Search/detail caches and install-wide quota counters are transient and removed from backup archives. User-edited product fields and user images remain separate from immutable provider attribution.

## Configuration and privacy

See `.env.example` for the bounded timeout, quota, and cache settings. USDA credentials are accepted only from the server environment, sent as `X-Api-Key`, and excluded from APIs, diagnostics, logs, and backups. Structured provider events must not include raw search text, barcodes, credentials, headers, or response bodies.

Routine tests use deterministic fetch mocks. Optional live smoke checks require `RUN_FOOD_PROVIDER_LIVE_TESTS=1` and an explicitly supplied key; they are never part of normal CI.

## Camera HTTPS through Nginx Proxy Manager

Camera access is an enhancement; manual barcode entry always remains available. Browsers require a secure context.

1. Keep Bòrd listening on its existing private HTTP container/LAN port.
2. Resolve `recipes.tower` through private DNS to Nginx Proxy Manager. Do not expose this Proxy Host through WAN port forwarding.
3. Issue a server certificate from the household local CA with `recipes.tower` in its Subject Alternative Name. Upload the certificate and private key to NPM as a custom certificate; never store CA or private-key material in this repository or Bòrd environment variables.
4. Create the NPM Proxy Host for `recipes.tower`, forward it to Bòrd, select the custom certificate, enable WebSocket support, and force SSL.
5. Set `APP_ORIGIN=https://recipes.tower`. Add only exact additional `TRUSTED_ORIGINS` when another browser-visible origin is genuinely needed.
6. Install and trust the local CA root on every scanning phone/tablet. A certificate-warning bypass is not acceptance.
7. Verify the final browser reports a secure context, profile cookies remain signed/secure through forwarded host and protocol headers, camera permission is offered, the rear camera scans a retail code, and manual entry still works when permission is denied.

NPM, Unraid, certificate trust, and physical-device completion may be claimed only after that real route is exercised.
