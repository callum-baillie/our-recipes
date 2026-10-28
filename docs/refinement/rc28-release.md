# RC28 product photos and register-style scan list

RC28 adds barcode-matched product photos and redesigns the scan list. It changes no schema (`0082_scanner_stations` / 84 migrations), key, permission or scanner binding.

Photos are requested through Bòrd's signed-in proxy `/api/v1/food-data/images/{gtin}`, which sends the server-held food API key. The proxy is bounded (one JPEG up to 2 MiB, three concurrent upstream requests, a 20-second deadline) and requires the food API's image routes, which Tower's published food API already enables. Without `BORD_FOOD_API_BASE_URL` and `BORD_FOOD_API_KEY` Bòrd requests nothing. Photos are Open Food Facts images under CC BY-SA 3.0; pages that show them carry the attribution.

Companion 0.2.2 changes one behavior: queuing a scan wakes the delivery worker at once. Its queue format, identity binding and heartbeat contract are unchanged, so it remains compatible with rc.26 and newer.

Verification evidence is in the release notes. The browser run used a mock food API; the live service's photos are checked after deployment (below).

## Tower verification — 28 October 2026 UTC

The [rc.28 multi-architecture build and both container smoke jobs](https://github.com/callum-baillie/our-recipes/actions/runs/40746550285) passed. Installed image index `sha256:d40f4a6be0de4ab149011051f2203759f09b71f8deff38b550f231b68951998e`, source `ecbea40b`. Companion `0.2.2-eee4450` was built on Tower from Forgejo commit `eee4450`.

Bòrd and the companion were stopped for a recovery copy at `/mnt/cache/backups/bord/20261028-rc28` (integrity `ok`). After startup all 123 tables had identical row counts except `scanner_station_events` (17 → 19, written by the restart); the scanner queue is unchanged (three succeeded, one needs review). HTTPS health returns rc.28 / schema 0082 / migrations current; both containers have zero restarts and Bòrd is healthy; the reader was captured and sync recovered. The food API's image cache reports 41 cached photos and returned a JPEG with Open Food Facts attribution for a real barcode; Bòrd's photo route returns 401 without a session.

Not verified on Tower: photos in a signed-in browser session and a physical scan through the new companion. Roll back by restoring the previous image tags (`ghcr.io/callum-baillie/bord:v1.0.0-rc.27`, `bord-scanner-companion:0.2.1-4d9df12`); no schema or data restore is needed.
