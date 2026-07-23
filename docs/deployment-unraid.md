# Unraid deployment

Barcode camera deployment uses the existing Nginx Proxy Manager path and a trusted local CA. Follow [food-data-integrations.md](food-data-integrations.md#camera-https-through-nginx-proxy-manager), set `APP_ORIGIN=https://recipes.tower`, and add the masked `USDA_FDC_API_KEY` variable only when USDA search is wanted. Keep the direct Bòrd port and NPM Proxy Host private to the trusted LAN.

1. Create `/mnt/user/appdata/bord`. On first start the image initializes ownership of this app-specific data directory before dropping to its non-root runtime user; do not map a shared media directory here.
2. Import `unraid/bord.xml` as a custom template, or adapt `docker-compose.unraid.yml`. Both use the public `ghcr.io/callum-baillie/bord:latest` image.
3. Map container `/data` to `/mnt/user/appdata/bord` and map container port `3000` to an unused LAN port (for example host port `4123`).
4. Set a unique `COOKIE_SECRET`, exact `APP_ORIGIN` using that same host port (such as `http://recipes.lan:4123`), timezone, and optional trusted proxy origins. Set a unique high-entropy `HOMEPAGE_INTEGRATION_TOKEN` only when the internal Homepage service will use the read-only summary endpoint. Set `OPENAI_API_KEY` only when you intentionally permit explicit OpenAI actions; do not mount or copy the development-only `.api_keys` file.
5. Start the container, check its health endpoint, complete household setup, and run `pnpm test:docker` or the equivalent target-host smoke procedure to prove persistence before relying on it.

For upgrades, pull the new image and recreate the container while keeping the same `/data` mapping. The entrypoint migrates the default legacy `our-recipes.db` filename to `bord.db` only when the destination is absent, and refuses an ambiguous two-database state. The PWA checks `/sw.js` without an intermediary cache, activates the current worker immediately, deletes both legacy `our-recipes-read-*` and current `bord-read-*` caches, and reloads open clients onto the current bundle.

The SQLite database, local images, and backup bundles must all remain under the one persistent `/data` mapping. Keep the application behind a trusted LAN or authenticated reverse proxy; profiles do not restrict access.

The template and compose example are prepared but not verified on an Unraid host in this workspace. Treat host-specific ownership, share settings, reverse proxy, and port mapping as operator review steps.
