# RC28 product photos and register-style scan list

RC28 adds barcode-matched product photos and redesigns the scan list. It changes no schema (`0082_scanner_stations` / 84 migrations), key, permission or scanner binding.

Photos are requested through Bòrd's signed-in proxy `/api/v1/food-data/images/{gtin}`, which sends the server-held food API key. The proxy is bounded (one JPEG up to 2 MiB, three concurrent upstream requests, a 20-second deadline) and requires the food API's image routes, which Tower's published food API already enables. Without `BORD_FOOD_API_BASE_URL` and `BORD_FOOD_API_KEY` Bòrd requests nothing. Photos are Open Food Facts images under CC BY-SA 3.0; pages that show them carry the attribution.

Companion 0.2.2 changes one behavior: queuing a scan wakes the delivery worker at once. Its queue format, identity binding and heartbeat contract are unchanged, so it remains compatible with rc.26 and newer.

Verification evidence is in the release notes. The browser run used a mock food API; the live service's photos are checked after deployment (below).
