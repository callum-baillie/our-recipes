# Configure Bòrd to use a local USDA food API

For the native product/store catalog, use the [native Bòrd Food API integration](bord-catalog-integration.md). This page documents the compatible `FOOD_DATA_MODE=direct` USDA mirror path.

[Bòrd Food API](https://github.com/callum-baillie/bord-food-api) runs beside Bòrd and serves an imported USDA FoodData Central dataset from its own SQLite database. Bòrd accesses it through the existing USDA provider. The USDA dataset is stored in the food API's persistent volume, separate from Bòrd's household data.

First deploy the food API using its [setup and configuration guide](https://github.com/callum-baillie/bord-food-api/blob/main/docs/setup-and-configuration.md). Wait until `http://YOUR-UNRAID-IP:8081/health` reports `status: ok` with a positive `totalFoods`. Current API startup can listen before data is ready; liveness alone does not prove USDA search readiness.

Use all four JSON datasets for packaged products and ordinary ingredients. A branded-only catalog supports packaged foods, but Bòrd's generic search filters to Foundation and Survey (FNDDS), so it needs those datasets too. The service supports the separate USDA JSON ZIPs; the combined CSV archive is unsupported.

## Required Bòrd settings

Set these on the **Bòrd server/container**:

```dotenv
USDA_FDC_ENABLED=true
USDA_FDC_BASE_URL=http://YOUR-UNRAID-IP:8081/fdc/v1
USDA_FDC_API_KEY=local
```

Replace `YOUR-UNRAID-IP` with the actual address of the host running the food API. Include `/fdc/v1`, with no trailing slash. These are runtime settings; no Bòrd source change or image rebuild is needed.

| Food API setting                                     | Matching Bòrd setting                                 |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `API_KEY` empty (authentication disabled)            | `USDA_FDC_API_KEY=local`                              |
| `API_KEY` set to your own shared key                 | `USDA_FDC_API_KEY` set to exactly that same key       |
| Host port `8081` mapped to container port `8080`     | `USDA_FDC_BASE_URL=http://YOUR-UNRAID-IP:8081/fdc/v1` |
| API and Bòrd on the same user-defined Docker network | `USDA_FDC_BASE_URL=http://bord-food-api:8080/fdc/v1`  |

Bòrd requires a nonempty `USDA_FDC_API_KEY` even if the local service does not require authentication. In that case `local` is just a placeholder; you do not need a real USDA key. Bòrd sends this value in the `X-Api-Key` header. The food API's optional key does not change Bòrd's own sign-in or household settings.

These variables are server-only. Do not give them a `NEXT_PUBLIC_` prefix or configure them in the browser. Keep `APP_ORIGIN`, `BETTER_AUTH_URL`, and `TRUSTED_ORIGINS` set for Bòrd's browser address; the food API URL does not belong in those settings. Camera scanning still uses Bòrd's [trusted HTTPS setup](food-data-integrations.md#camera-https-through-nginx-proxy-manager).

## Unraid container UI

1. Keep the existing Bòrd container's image, data mounts, browser URL, and household configuration.
2. Open **Docker → Bòrd → Edit**.
3. Add or edit three **Variable** entries using the exact keys and values above: `USDA_FDC_ENABLED`, `USDA_FDC_BASE_URL`, and `USDA_FDC_API_KEY`. Use a masked field for the key if you have enabled food API authentication.
4. Select **Apply** to recreate Bòrd with those variables.
5. Run the [connection checks](#verify-the-connection) below.

Do not put these variables only on `bord-food-api`: Bòrd needs its own connection settings. If you later change the API's host port or key, update Bòrd too and Apply again.

## Docker Compose

The current Bòrd Compose files pass `USDA_FDC_BASE_URL` and `USDA_FDC_API_KEY` into the container, so you can set those variables directly in the existing `.env` file. Older deployment templates can use the explicit override below.

Create `compose.food-api.yaml` beside Bòrd's Compose file:

```yaml
services:
  bord:
    environment:
      USDA_FDC_ENABLED: 'true'
      USDA_FDC_BASE_URL: ${LOCAL_FOOD_API_URL:?Set LOCAL_FOOD_API_URL to the local service URL ending in /fdc/v1}
      USDA_FDC_API_KEY: ${LOCAL_FOOD_API_KEY:-local}
```

Add these values to the existing Bòrd `.env` file, retaining its other settings:

```dotenv
LOCAL_FOOD_API_URL=http://YOUR-UNRAID-IP:8081/fdc/v1
LOCAL_FOOD_API_KEY=local
```

Replace `local` with the shared key if food API authentication is enabled. From the Bòrd project directory, apply the override to your **existing** base configuration:

```sh
# If your deployment uses docker-compose.unraid.yml:
docker compose -f docker-compose.unraid.yml -f compose.food-api.yaml up -d bord

# Alternatively, if it uses docker-compose.yml:
docker compose -f docker-compose.yml -f compose.food-api.yaml up -d bord
```

Run only the command that matches your installation, retaining any additional Compose files or project-name options you already use. These commands assume Bòrd's normal required deployment settings are configured. They do not replace the [Docker](deployment.md) or [Unraid](deployment-unraid.md) installation steps.

Use the same file list for future `up`/update commands so the override remains applied. Re-running `up -d` applies environment changes; `docker compose restart` alone does not. If `bord-food-api` is checked out alongside this project, its `examples/bord.compose.override.yaml` contains the same override and can be used instead of creating a copy.

## Local Bòrd development

Add the three `USDA_FDC_*` settings to Bòrd's `.env.local`, then restart `pnpm dev`. If the food API uses its default local Compose setup, use:

```dotenv
USDA_FDC_ENABLED=true
USDA_FDC_BASE_URL=http://localhost:8081/fdc/v1
USDA_FDC_API_KEY=local
```

If the food API is running directly with Python on the same machine, its default port is `8080`, so use `http://localhost:8080/fdc/v1`. `localhost` works here because Bòrd is running on the host; it has a different meaning inside a container.

## Network choices

The simplest setup uses the Unraid host's LAN IP and the API's published host port, such as `http://192.168.1.20:8081/fdc/v1`. The address must be reachable **from Bòrd's container**.

For container-name resolution, both containers must join the same user-defined Docker network. A service name in one Compose project is not automatically resolvable in another project's default network. In Unraid, select the same custom Docker network in both container definitions. For Compose, create a shared network once:

```sh
docker network create bord-food
```

Then merge the following into the food API's Compose configuration:

```yaml
services:
  bord-food-api:
    networks:
      - bord-food
networks:
  bord-food:
    external: true
```

And merge this into Bòrd's `compose.food-api.yaml`, alongside its environment mapping:

```yaml
services:
  bord:
    networks:
      - default
      - bord-food
networks:
  bord-food:
    external: true
```

Preserve any existing network attachments your deployment needs. Recreate both services with their updated configurations, and set `LOCAL_FOOD_API_URL=http://bord-food-api:8080/fdc/v1` for Bòrd. Use container port `8080` for this route, even if you changed the host port. A container's `localhost` refers to itself, so `http://localhost:8081` inside Bòrd will not reach the food API.

## Verify the connection

First check food API readiness from the host:

```sh
curl --fail http://YOUR-UNRAID-IP:8081/health
```

Then test a real search from the running Bòrd container using its configured URL and key. This read-only check requires neither curl inside the image nor an external USDA request when the base URL is local:

```sh
docker exec -i bord node --input-type=module <<'JS'
const base = process.env.USDA_FDC_BASE_URL;
if (!base || !process.env.USDA_FDC_API_KEY) {
  throw new Error("Set USDA_FDC_BASE_URL and USDA_FDC_API_KEY on the Bòrd container first.");
}
const response = await fetch(`${base.replace(/\/$/, "")}/foods/search`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.USDA_FDC_API_KEY,
  },
  body: JSON.stringify({ query: "oats", pageSize: 1 }),
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`Food API returned HTTP ${response.status}`);
const data = await response.json();
console.log({ status: response.status, totalHits: data.totalHits, returned: data.foods.length });
JS
```

Replace `bord` if your container has a different name. Expect HTTP `200` and, with the recommended datasets, a positive hit count. The command does not print credentials or modify household data. It tests network access and API authentication; the next step checks Bòrd's provider behavior.

In Bòrd, open the shared food picker from Pantry, a recipe ingredient, or Nutrition and use **Search USDA** with a food name. Confirm a result opens the nutrition review. Search and opening the review do not add pantry stock or Food Diary intake; saving remains an explicit action. A provider status of `available` means configured, so perform an actual search to prove connectivity.

## Behavior and maintenance

- The UI still calls this provider USDA. It reads the local release snapshot after this change; it does not automatically fall back to USDA's hosted API if the local service is unavailable.
- Existing Pantry products are searched first. Open Food Facts remains the first external barcode lookup, with USDA as a branded-barcode fallback. Switching the USDA URL does not make every food provider offline.
- Bòrd retains its provider cache and request budget. Defaults are 900 USDA requests/hour, an 8-second request timeout, 15 minutes for search/negative-cache freshness, and 7 days for exact lookup/detail freshness. Restarting does not clear its SQLite-backed provider cache. Existing cached records may outlive an API dataset update until expiry. Endpoint/configuration changes now use a different cache namespace.
- Optional server settings are `USDA_FDC_TIMEOUT_MS` (1,000–30,000), `USDA_FDC_REQUESTS_PER_HOUR` (1–1,000), and `USDA_FDC_LOW_QUOTA_REMAINING` (0–1,000). Keep defaults initially; Compose must explicitly pass any overrides into the container. See [.env.example](../.env.example) for cache settings.
- Refresh/import datasets in the food API container using its [maintenance instructions](https://github.com/callum-baillie/bord-food-api/blob/main/docs/setup-and-configuration.md#updates-and-backups). Updating an image does not update datasets. A successful refresh does not rewrite products or nutrition snapshots already reviewed and saved in Bòrd.
- Bòrd recovery bundles do not include the separate food API volume. Preserve that catalog independently or rebuild it from USDA files.

## Troubleshooting

| Symptom                                           | Check or action                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| USDA is not configured/disabled                   | Ensure `USDA_FDC_ENABLED=true` and a nonempty `USDA_FDC_API_KEY` reached Bòrd's runtime. With no API authentication, use `local`. Recreate the container after changes.                    |
| Host health works, Bòrd search fails              | Run the container-side check above. Verify the host IP/port or shared Docker network; do not use container `localhost` for another service.                                                |
| HTTP `401`                                        | Match Bòrd's `USDA_FDC_API_KEY` to the food API's `API_KEY`. A successful `/health` call does not validate credentials.                                                                    |
| HTTP `404` for search                             | Check that `USDA_FDC_BASE_URL` ends in `/fdc/v1`, not `/docs` or `/foods/search`.                                                                                                          |
| Connection refused during installation            | Wait for the first food API import to finish and inspect `docker logs bord-food-api`.                                                                                                      |
| Generic search has no results                     | Import Foundation and/or FNDDS. Branded-only data cannot satisfy that filter.                                                                                                              |
| API works directly, but Bòrd shows old/no results | Allow existing search/negative cache entries to expire, or try a different search to verify a fresh request. Check Bòrd's provider quota/status too. Do not delete the household database. |
| Barcode search still contacts Open Food Facts     | Expected: changing USDA's base URL changes only the USDA provider. Use explicit **Search USDA** to test the local service.                                                                 |
| Food API data changes do not appear               | Confirm an explicit `import` or `refresh` succeeded; file additions and restarts alone reuse the catalog. Then account for Bòrd's cache.                                                   |

To return to USDA's hosted API, set `USDA_FDC_BASE_URL=https://api.nal.usda.gov/fdc/v1`, replace the placeholder/shared key with your real USDA API key, and recreate Bòrd. In the Compose override above, change the corresponding `LOCAL_FOOD_API_URL` and `LOCAL_FOOD_API_KEY` values. To disable USDA entirely, set `USDA_FDC_ENABLED=false` in the runtime configuration (including the override's literal `true`, if used) and recreate Bòrd.
